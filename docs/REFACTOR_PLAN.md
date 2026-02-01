# Refactor Plan: Milestone D → Centralized Image Analysis

**Date:** Feb 1, 2026  
**Status:** Planning  
**Goal:** Move image analysis from Mac Swift app to Node server for cleaner architecture

---

## Overview

### Current Architecture (Milestone D)
```
macOS PhotosManager
  ↓ Extract metadata only
  ↓ POST /api/assets (metadata only)
Node Server
  ↓ Store metadata in memory (no database)
macOS ModelManager
  ↓ Fetch assets from server
  ↓ Call Ollama HTTP API (localhost:11434)
  ↓ Analyze: OCR, summary, embedding
  ↓ POST /api/assets (update with results)
Node Server
  ↓ Store results in memory
```

**Problems:**
- Duplication: Need to implement same logic in iOS
- Tight coupling: Node server depends on Mac app for analysis
- Poor scalability: Can't process images without Mac app running
- Complex iOS integration: iOS would need its own Ollama client

---

### New Architecture (Refactored)
```
macOS/iOS App
  ↓ Extract metadata + image data (compressed 70% JPEG)
  ↓ Compute SHA-256 content hash
  ↓ POST /api/assets/upload (multipart/form-data)
Node Server (Bull Queue: 'image-upload')
  ↓ Check: Does contentHash exist in SQLite?
  ↓ YES → Skip (dedupe)
  ↓ NO → Store in SQLite + enqueue 'image-analysis'
Node Server (Bull Queue: 'image-analysis')
  ↓ Fetch asset from SQLite
  ↓ Call Ollama HTTP API (localhost:11434)
  ↓ Analyze: OCR, summary, embedding
  ↓ Update SQLite with results
  ↓ Enqueue 'intent-routing' if actionable
  ↓ Broadcast via WebSocket: "Asset analyzed"
macOS/iOS App (WebSocket listener)
  ↓ Update UI with analysis results
```

**Benefits:**
- Single analysis pipeline (no duplication)
- iOS and macOS treated identically
- Better job queue management (Bull)
- Easier Weave tracing (all in Node)
- Simpler Mac app (just upload, no orchestration)

---

## Step-by-Step Refactor Plan

### Phase 1: Server Foundation (Milestone E)

#### 1.1 Install Dependencies
```bash
cd photo-agent-server
npm install better-sqlite3 bull ioredis @bull-board/express crypto-js multer concurrently
npm install --save-dev @types/multer @types/better-sqlite3
```

**Note:** 
- `ioredis` is the Redis client library (industry standard)
- `concurrently` allows running multiple npm scripts in parallel
- Redis server should be running locally, but code includes fallback for development

#### 1.2 Create Database Schema
**File:** `photo-agent-server/src/db/sqlite.ts`

```typescript
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.join(__dirname, '../../data/photos.db');
const DATA_DIR = path.dirname(DB_PATH);

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export const db = new Database(DB_PATH);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS assets (
    id TEXT PRIMARY KEY,
    photoLibraryId TEXT NOT NULL,
    contentHash TEXT UNIQUE NOT NULL,
    deviceId TEXT,
    creationDate TEXT,
    latitude REAL,
    longitude REAL,
    altitude REAL,
    filename TEXT,
    mediaType TEXT NOT NULL,
    isFavorite INTEGER DEFAULT 0,
    ocrText TEXT,
    summary TEXT,
    embedding TEXT,
    intentLabels TEXT,
    confidence REAL,
    imageData BLOB,
    createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
    updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_content_hash ON assets(contentHash);
  CREATE INDEX IF NOT EXISTS idx_creation_date ON assets(creationDate DESC);
  CREATE INDEX IF NOT EXISTS idx_device_id ON assets(deviceId);
  CREATE INDEX IF NOT EXISTS idx_photo_library_id ON assets(photoLibraryId);
`);

console.log('✅ SQLite database initialized');
```

#### 1.3 Create Ollama Service
**File:** `photo-agent-server/src/services/ollama.ts`

```typescript
import axios from 'axios';

const OLLAMA_BASE_URL = 'http://localhost:11434';
const VISION_MODEL = 'qwen3-vl:8b';
const EMBEDDING_MODEL = 'nomic-embed-text';

export interface AnalysisResult {
  summary: string;
  ocrText: string;
  embedding: number[];
}

export async function checkOllamaStatus(): Promise<boolean> {
  try {
    const response = await axios.get(`${OLLAMA_BASE_URL}/api/tags`);
    const models = response.data.models.map((m: any) => m.name);
    return models.includes(VISION_MODEL) && models.includes(EMBEDDING_MODEL);
  } catch (error) {
    return false;
  }
}

export async function analyzeImage(imageData: Buffer): Promise<AnalysisResult> {
  const base64Image = imageData.toString('base64');

  // Step 1: Generate summary and OCR
  const prompt = `Your task is to create an opinionated summary of this image and an explanation of your reasoning for generating the summary. The summary is going to be later used for retrieval via search, categorization and other downstream tasks. The summary shouldn't be longer than 4 sentences.

Things to focus on:
- include what the image/scene is
- colors
- defining qualities of the image
- if it is pictures of people, describe the relationship between the people
- describe the foreground and background of the image
- if the image is mostly text (e.g. book/essay/article screenshot, social media post that is mostly text, informational flyer/poster) make sure the summary describes the text content or theme

After the summary, extract ALL visible text from the image (OCR). Format your response as:
SUMMARY: [your summary here]
OCR: [all extracted text here]`;

  const generateResponse = await axios.post(`${OLLAMA_BASE_URL}/api/generate`, {
    model: VISION_MODEL,
    prompt,
    images: [base64Image],
    stream: false
  });

  const fullResponse = generateResponse.data.response;
  const { summary, ocrText } = parseResponseForSummaryAndOCR(fullResponse);

  // Step 2: Generate embedding from summary
  const embeddingResponse = await axios.post(`${OLLAMA_BASE_URL}/api/embeddings`, {
    model: EMBEDDING_MODEL,
    prompt: summary
  });

  const embedding = embeddingResponse.data.embedding;

  return { summary, ocrText, embedding };
}

function parseResponseForSummaryAndOCR(response: string): { summary: string; ocrText: string } {
  const lines = response.split('\n');
  let summary = '';
  let ocrText = '';
  let currentSection = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('SUMMARY:')) {
      currentSection = 'summary';
      summary = trimmed.substring('SUMMARY:'.length).trim();
    } else if (trimmed.startsWith('OCR:')) {
      currentSection = 'ocr';
      ocrText = trimmed.substring('OCR:'.length).trim();
    } else if (currentSection === 'summary') {
      summary += ' ' + trimmed;
    } else if (currentSection === 'ocr') {
      ocrText += ' ' + trimmed;
    }
  }

  // Fallback if parsing failed
  if (!summary) {
    const midpoint = Math.floor(response.length / 2);
    summary = response.substring(0, midpoint).trim();
    ocrText = response.substring(midpoint).trim();
  }

  return { summary, ocrText };
}
```

#### 1.4 Create Bull Queue Service
**File:** `photo-agent-server/src/services/queue.ts`

```typescript
import Bull from 'bull';
import { createBullBoard } from '@bull-board/api';
import { BullAdapter } from '@bull-board/api/bullAdapter';
import { ExpressAdapter } from '@bull-board/express';

// Redis connection config (ioredis format)
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy: (times: number) => {
    // Retry connection with exponential backoff
    if (times > 10) {
      console.error('❌ Could not connect to Redis after 10 attempts');
      return null;
    }
    const delay = Math.min(times * 50, 2000);
    return delay;
  }
};

// Create queues
export const imageUploadQueue = new Bull('image-upload', {
  redis: redisConfig
});

export const imageAnalysisQueue = new Bull('image-analysis', {
  redis: redisConfig
});

export const intentRoutingQueue = new Bull('intent-routing', {
  redis: redisConfig
});

// Bull Board UI
export const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

createBullBoard({
  queues: [
    new BullAdapter(imageUploadQueue),
    new BullAdapter(imageAnalysisQueue),
    new BullAdapter(intentRoutingQueue)
  ],
  serverAdapter
});

// Log connection status
imageUploadQueue.client.on('ready', () => {
  console.log('✅ Bull queues connected to Redis');
});

imageUploadQueue.client.on('error', (err) => {
  console.error('❌ Redis connection error:', err.message);
  console.log('⚠️  Make sure Redis is running: brew services start redis');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 Shutting down queues...');
  await imageUploadQueue.close();
  await imageAnalysisQueue.close();
  await intentRoutingQueue.close();
});

console.log('✅ Bull queue service initialized');
```

#### 1.5 Create Upload Endpoint
**File:** `photo-agent-server/src/routes/assets.ts`

```typescript
import express from 'express';
import multer from 'multer';
import crypto from 'crypto';
import { db } from '../db/sqlite';
import { imageUploadQueue } from '../services/queue';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post('/upload', upload.single('image'), async (req, res) => {
  try {
    const { photoLibraryId, deviceId, creationDate, latitude, longitude, altitude, filename, mediaType, isFavorite } = req.body;
    const imageData = req.file?.buffer;

    if (!imageData) {
      return res.status(400).json({ error: 'No image provided' });
    }

    // Compute content hash
    const contentHash = crypto.createHash('sha256').update(imageData).digest('hex');

    // Check if already exists
    const existing = db.prepare('SELECT id FROM assets WHERE contentHash = ?').get(contentHash);
    if (existing) {
      return res.json({ success: true, assetId: existing.id, deduplicated: true });
    }

    // Enqueue for processing
    const job = await imageUploadQueue.add({
      photoLibraryId,
      contentHash,
      deviceId,
      creationDate,
      latitude: latitude ? parseFloat(latitude) : null,
      longitude: longitude ? parseFloat(longitude) : null,
      altitude: altitude ? parseFloat(altitude) : null,
      filename,
      mediaType,
      isFavorite: isFavorite === 'true',
      imageData: imageData.toString('base64')
    });

    res.json({ success: true, jobId: job.id });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

export default router;
```

#### 1.6 Create Queue Workers

**File:** `photo-agent-server/src/workers/index.ts`

```typescript
// Central workers entry point
// This file is run as a separate process via npm run dev:workers
import './image-upload';
import './image-analysis';

console.log('✅ All workers started');

// Keep process alive
process.on('SIGTERM', () => {
  console.log('🛑 Shutting down workers...');
  process.exit(0);
});
```

**File:** `photo-agent-server/src/workers/image-upload.ts`

```typescript
import { imageUploadQueue, imageAnalysisQueue } from '../services/queue';
import { db } from '../db/sqlite';
import { v4 as uuidv4 } from 'uuid';

imageUploadQueue.process(async (job) => {
  const { photoLibraryId, contentHash, deviceId, creationDate, latitude, longitude, altitude, filename, mediaType, isFavorite, imageData } = job.data;

  // Store in database
  const assetId = uuidv4();
  const imageBuffer = Buffer.from(imageData, 'base64');

  db.prepare(`
    INSERT INTO assets (id, photoLibraryId, contentHash, deviceId, creationDate, latitude, longitude, altitude, filename, mediaType, isFavorite, imageData)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(assetId, photoLibraryId, contentHash, deviceId, creationDate, latitude, longitude, altitude, filename, mediaType, isFavorite ? 1 : 0, imageBuffer);

  console.log(`✅ Stored asset: ${assetId}`);

  // Enqueue for analysis
  await imageAnalysisQueue.add({ assetId });

  return { assetId };
});

console.log('✅ Image upload worker started');
```

**File:** `photo-agent-server/src/workers/image-analysis.ts`

```typescript
import { imageAnalysisQueue, intentRoutingQueue } from '../services/queue';
import { db } from '../db/sqlite';
import { analyzeImage } from '../services/ollama';

imageAnalysisQueue.process(4, async (job) => { // 4 concurrent
  const { assetId } = job.data;

  // Fetch asset from database
  const asset = db.prepare('SELECT imageData FROM assets WHERE id = ?').get(assetId);
  if (!asset) {
    throw new Error(`Asset not found: ${assetId}`);
  }

  // Analyze image
  const { summary, ocrText, embedding } = await analyzeImage(asset.imageData);

  // Update database
  db.prepare(`
    UPDATE assets
    SET ocrText = ?, summary = ?, embedding = ?, updatedAt = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(ocrText, summary, JSON.stringify(embedding), assetId);

  console.log(`✅ Analyzed asset: ${assetId}`);

  // Enqueue for intent routing
  await intentRoutingQueue.add({ assetId });

  return { assetId };
});

console.log('✅ Image analysis worker started (concurrency: 4)');
```

#### 1.7 Update Main Server File
**File:** `photo-agent-server/src/index.ts`

```typescript
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import assetsRouter from './routes/assets';
import { serverAdapter } from './services/queue';
import './db/sqlite';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 1738;

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/assets', assetsRouter);
app.use('/admin/queues', serverAdapter.getRouter());

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 Bull Board available at http://localhost:${PORT}/admin/queues`);
});
```

#### 1.8 Configure package.json Scripts
**File:** `photo-agent-server/package.json`

```json
{
  "name": "photo-agent-server",
  "version": "0.1.0",
  "scripts": {
    "dev": "concurrently \"npm run dev:server\" \"npm run dev:workers\"",
    "dev:server": "ts-node-dev --respawn --transpile-only src/index.ts",
    "dev:workers": "ts-node-dev --respawn --transpile-only src/workers/index.ts",
    "start": "node dist/index.js",
    "build": "tsc",
    "worker": "node dist/workers/index.js"
  },
  "dependencies": {
    "better-sqlite3": "^11.0.0",
    "bull": "^4.12.0",
    "@bull-board/express": "^5.0.0",
    "ioredis": "^5.3.0",
    "express": "^4.18.0",
    "cors": "^2.8.5",
    "dotenv": "^16.0.0",
    "multer": "^1.4.5-lts.1",
    "crypto-js": "^4.2.0",
    "axios": "^1.6.0",
    "concurrently": "^8.2.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/express": "^4.17.0",
    "@types/cors": "^2.8.0",
    "@types/multer": "^1.4.0",
    "@types/better-sqlite3": "^7.6.0",
    "typescript": "^5.0.0",
    "ts-node-dev": "^2.0.0"
  }
}
```

**Note:** 
- `npm run dev` starts both server and workers concurrently
- `ts-node-dev` enables hot reload during development
- Workers run in separate process for better isolation

---

### Phase 2: Mac App Refactor

#### 2.1 Add SHA-256 Hashing to UserAsset
**File:** `photo-agent-macos/Models/UserAsset.swift`

```swift
struct UserAsset: Codable, Identifiable {
    let id: String
    let photoLibraryId: String
    let contentHash: String?  // NEW: SHA-256 hash
    // ... existing fields
}
```

#### 2.2 Update PhotosManager to Upload Images
**File:** `photo-agent-macos/Managers/PhotosManager.swift`

**Changes needed:**
1. In `extractMetadata()`, also fetch image data and compute SHA-256 hash
2. In `sendToServer()`, change from JSON to multipart/form-data upload
3. Include compressed image data (70% JPEG quality)

**New helper methods:**
```swift
private func getImageData(from asset: PHAsset) async -> Data? {
    return await withCheckedContinuation { continuation in
        let options = PHImageRequestOptions()
        options.deliveryMode = .highQualityFormat
        options.isNetworkAccessAllowed = true
        
        PHImageManager.default().requestImageDataAndOrientation(for: asset, options: options) { data, _, _, _ in
            continuation.resume(returning: data)
        }
    }
}

private func compressImage(_ data: Data) -> Data? {
    #if os(macOS)
    guard let nsImage = NSImage(data: data),
          let cgImage = nsImage.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
        return nil
    }
    let bitmapRep = NSBitmapImageRep(cgImage: cgImage)
    return bitmapRep.representation(using: .jpeg, properties: [.compressionFactor: 0.7])
    #endif
}

private func computeSHA256(_ data: Data) -> String {
    import CryptoKit
    let hash = SHA256.hash(data: data)
    return hash.compactMap { String(format: "%02x", $0) }.joined()
}
```

#### 2.3 Simplify ModelManager
**File:** `photo-agent-macos/Managers/ModelManager.swift`

**Changes:**
- Keep `checkOllamaStatus()` method (still useful for UI)
- **Remove** `analyzePhoto()`, `analyzeSummaryAndOCR()`, `generateEmbedding()` methods
- **Remove** `sendAnalysisToServer()` method
- **Remove** parallel processing logic (Bull handles this now)

**New simplified version:**
```swift
@MainActor
class ModelManager {
    private let appState: AppState
    private let ollamaBaseURL = "http://localhost:11434"
    
    init(appState: AppState) {
        self.appState = appState
    }
    
    // Keep only status check
    func checkOllamaStatus() async {
        // ... existing implementation
    }
}
```

#### 2.4 Update StatusDashboardView
**File:** `photo-agent-macos/Views/StatusDashboardView.swift`

**Changes:**
- Remove "Analyze Photos" button (analysis happens automatically server-side)
- Update Model Analysis card to show queue status from server
- Fetch queue status: `GET /api/queue/status`

---

### Phase 3: iOS App Implementation

#### 3.1 Create Shared Swift Package
```bash
mkdir photo-agent-shared
cd photo-agent-shared
swift package init --type library
```

**File:** `photo-agent-shared/Package.swift`
```swift
// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "PhotoAgentModels",
    platforms: [.macOS(.v13), .iOS(.v16)],
    products: [
        .library(name: "PhotoAgentModels", targets: ["PhotoAgentModels"]),
    ],
    targets: [
        .target(name: "PhotoAgentModels", dependencies: []),
    ]
)
```

Move shared models to this package, then import in both apps.

#### 3.2 Implement iOS Photo Upload
Follow same pattern as macOS PhotosManager refactor.

---

## Testing Checklist

### Server Tests
- [ ] SQLite database creates correctly
- [ ] Upload endpoint accepts multipart data
- [ ] Content hash deduplication works
- [ ] Bull queues process jobs
- [ ] Ollama analysis completes successfully
- [ ] Results stored in database

### Mac App Tests
- [ ] Image upload works
- [ ] SHA-256 hash computed correctly
- [ ] Compression to 70% JPEG works
- [ ] Progress tracking updates correctly
- [ ] Server errors handled gracefully

### iOS App Tests
- [ ] Pairing via QR code works
- [ ] Photo monitoring detects new photos
- [ ] Upload queue handles offline
- [ ] Tunnel reconnection works

---

## Rollback Plan

If refactor fails, revert to Milestone D architecture:
1. Git revert server changes
2. Restore ModelManager.swift from git history
3. Keep PhotosManager sending metadata only

---

## Timeline

| Phase | Estimated Time |
|-------|----------------|
| Phase 1: Server Foundation | 4-6 hours |
| Phase 2: Mac App Refactor | 2-3 hours |
| Phase 3: iOS Implementation | 6-8 hours |
| Testing & Debug | 2-4 hours |
| **Total** | **14-21 hours** |

---

## Success Criteria

- [ ] Mac app uploads images successfully
- [ ] Server analyzes images via Ollama
- [ ] Results stored in SQLite
- [ ] Bull queues visible in Bull Board
- [ ] No duplicate processing (SHA-256 dedupe works)
- [ ] iOS app can upload and see results
- [ ] Performance: 4 concurrent analyses
- [ ] All tests pass
