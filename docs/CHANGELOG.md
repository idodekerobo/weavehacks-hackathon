# Change Feed
### In reverse chronological order.
Each change is numbered and timestamped.

---

## [#5] iOS Photo Upload + Approvals UI (Milestones P+Q)
**Date:** Feb 1, 2026  
**Type:** New Feature  
**Milestones:** P (iOS Photo Upload + Monitoring), Q (iOS Approvals + Search UI)

### Summary
Implemented complete iOS photo upload monitoring and approvals management system. The app can now automatically upload new photos taken after pairing, and provides a full UI for managing approvals with approve/reject actions. Search UI is implemented with graceful handling for future backend integration.

### Changes

#### iOS App (UPDATED - Photo Monitoring)
- **PhotosMonitor**: Automatic photo monitoring and upload
  - `Managers/PhotosMonitor.swift` - PHPhotoLibraryChangeObserver implementation
  - Monitors for new photos after pairing timestamp
  - Extracts metadata (location, date, filename)
  - Compresses images to 70% JPEG quality
  - Computes SHA-256 content hash
  - Uploads via multipart/form-data to `/api/assets/upload`
  - Real-time upload statistics tracking

- **UploadStatusView**: Upload progress UI
  - `Views/UploadStatusView.swift` - Start/stop monitoring controls
  - Live stats display (uploaded, pending, failed)
  - Error handling and display
  - Photo permissions request flow

- **Updated AppState**: Photo monitoring state
  - `Models/AppState.swift` - Added isMonitoringPhotos, upload counts
  - PhotosMonitor lifecycle management
  - Unpair cleanup for monitoring state

#### iOS App (NEW - Approvals & Search)
- **ApprovalManager**: Approvals data management
  - `Managers/ApprovalManager.swift` - Fetch, approve, reject approvals
  - Filter by status (pending, approved, rejected, all)
  - Real-time approval counts via polling
  - Error handling for API calls

- **ApprovalsView**: Main approvals inbox
  - `Views/ApprovalsView.swift` - Approval cards list
  - Segmented filter picker
  - Pull-to-refresh
  - Empty states per filter
  - Tap to view details

- **ApprovalDetailView**: Full approval details
  - `Views/ApprovalDetailView.swift` - Detailed approval view
  - Summary, OCR text, AI reasoning display
  - Proposed action details
  - Approve/Reject buttons (pending only)
  - Metadata display (timestamps, filename)
  - Status badges and confidence scores

- **SearchView**: Natural language search UI
  - `Views/SearchView.swift` - Search interface
  - Search bar with suggestions
  - Results display with intent cards
  - Graceful handling of unimplemented endpoint
  - Error states and empty results

- **Updated MainTabView**: Real approvals + search
  - `Views/MainTabView.swift` - Replaced placeholders
  - ApprovalsView in Inbox tab
  - SearchView in Search tab
  - Upload status in Settings

- **Updated ConnectionManager**: Approval polling
  - `Managers/ConnectionManager.swift` - Poll for approval counts
  - Call `/api/approvals/stats/counts` every 10s
  - Update badge count on Inbox tab

#### Server (NEW - Approvals API)
- **Approvals Router**: Full CRUD API for approvals
  - `src/routes/approvals.ts` - Approval endpoints
    - `GET /api/approvals` - List approvals with filters (status, deviceId)
    - `GET /api/approvals/:id` - Get single approval with asset details
    - `PATCH /api/approvals/:id` - Update status (approve/reject)
    - `GET /api/approvals/stats/counts` - Get counts by status
  - Joins with assets table for photo metadata
  - Device filtering for multi-device support

- **Database**: Approvals table
  - `src/db/sqlite.ts` - Added approvals schema
  - Fields: id, assetId, deviceId, intentType, extractedData, proposedAction, confidence, status, editedData, timestamps
  - Indexes: status, deviceId, assetId, createdAt
  - Foreign key to assets table

- **Intent Routing Worker**: Create approvals
  - `src/workers/intent-routing.ts` - Updated to create approvals
  - For event_flyer with confidence >= 70%
  - Creates pending approval with extracted data
  - Stores proposed action (RSVP + calendar)
  - Weave logging for approval creation

- **Server Integration**:
  - `src/index.ts` - Added approvals router

### Photo Monitoring Flow
```
User enables monitoring
  ↓ Request Photos authorization
  ↓ Store pairing timestamp
PHPhotoLibrary changes detected
  ↓ Filter: photos after pairing
For each new photo:
  ↓ Extract metadata
  ↓ Compress to 70% JPEG
  ↓ Compute SHA-256 hash
  ↓ Upload to /api/assets/upload
  ↓ Track status (pending → uploaded/failed)
```

### Approvals Flow
```
Photo uploaded → Analyzed (Phase 2)
  ↓ Intent classified (e.g., event_flyer)
  ↓ Confidence >= 70%?
  YES ↓ Create approval in database
iOS app polls /api/approvals/stats/counts (10s)
  ↓ Update badge count
User opens Inbox → ApprovalsView
  ↓ Fetch approvals
  ↓ Display cards (filter by status)
User taps approval → ApprovalDetailView
  ↓ Show details + reasoning
User approves/rejects
  ↓ PATCH /api/approvals/:id
  ↓ Update status in database
(Phase 3) → Execute action via Browserbase
```

### Key Features
**Photo Monitoring (Milestone P):**
- ✅ Automatic monitoring after pairing
- ✅ Only uploads photos taken AFTER pairing (privacy)
- ✅ Image compression (70% JPEG)
- ✅ Content hash deduplication
- ✅ Metadata extraction (location, date, filename)
- ✅ Real-time upload statistics
- ✅ Error handling and display

**Approvals & Search (Milestone Q):**
- ✅ Full approvals CRUD API
- ✅ Filter by status (pending, approved, rejected, all)
- ✅ Rich approval cards with confidence scores
- ✅ Detailed view with AI reasoning
- ✅ Approve/Reject with single tap
- ✅ Pull-to-refresh
- ✅ Real-time counts via polling
- ✅ Empty states and error handling
- ✅ Natural language search UI (placeholder backend)

### Manual Setup Required

**iOS App:**
1. Add `NSPhotoLibraryUsageDescription` to Info.plist:
   ```xml
   <key>NSPhotoLibraryUsageDescription</key>
   <string>We need access to upload and analyze your photos</string>
   ```

2. Enable photo monitoring in Settings tab after pairing

### Files Created/Updated

**iOS:**
- `photo-agent-ios/Managers/PhotosMonitor.swift` ✅
- `photo-agent-ios/Managers/ApprovalManager.swift` ✅
- `photo-agent-ios/Views/UploadStatusView.swift` ✅
- `photo-agent-ios/Views/ApprovalsView.swift` ✅
- `photo-agent-ios/Views/ApprovalDetailView.swift` ✅
- `photo-agent-ios/Views/SearchView.swift` ✅
- `photo-agent-ios/Models/AppState.swift` ✅ (updated)
- `photo-agent-ios/Managers/ConnectionManager.swift` ✅ (updated)
- `photo-agent-ios/Views/MainTabView.swift` ✅ (updated)

**Server:**
- `photo-agent-server/src/routes/approvals.ts` ✅
- `photo-agent-server/src/db/sqlite.ts` ✅ (updated)
- `photo-agent-server/src/workers/intent-routing.ts` ✅ (updated)
- `photo-agent-server/src/index.ts` ✅ (updated)

### Next Steps
- Milestone N: macOS approvals inbox UI
- Milestone R: WebSocket/SSE real-time updates (replace polling)
- Phase 3: Browserbase integration for action execution

---

## [#4] Phase 2 Complete: Weave Observability + Intent Pipeline (Milestones G & H)
**Date:** Feb 1, 2026  
**Type:** New Feature  
**Milestones:** G (Weave Observability), H (Intent Pipeline)

### Summary
Completed Phase 2 by integrating Weave observability for tracing all agent runs and implementing the intent classification pipeline. Photos are now automatically classified as `event_flyer`, `general_photo`, or `other`, with high-confidence event flyers marked as ready for Browserbase processing in Phase 3.

### Changes

#### Weave Integration (Milestone G)
- **Weave Service**: Centralized Weave client management
  - `src/services/weave.ts` - Initialize Weave, create traced operations, log attributes
  - `initWeave()` - Initialize Weave client with project name "photo-agent"
  - `createTracedOp()` - Wrap functions with Weave tracing
  - `logAttributes()` - Attach attributes to current trace context
  - Graceful degradation if WEAVE_API_KEY not set

- **Server Integration**:
  - `src/index.ts` - Initialize Weave on server startup
  - All HTTP requests now traced automatically

- **Workers Integration**:
  - `src/workers/index.ts` - Initialize Weave for all workers
  - All worker jobs now traced end-to-end

#### Intent Classification Pipeline (Milestone H)
- **Ollama Service Updates**: Added intent classification
  - `src/services/ollama.ts` - New `classifyIntent()` function
  - Analyzes summary + OCR text to classify intent type
  - Returns: intentType (`event_flyer`, `general_photo`, `other`), confidence (0-1), reasoning
  - Uses structured prompt with examples for consistent classification
  - Wrapped with Weave tracing via `createTracedOp()`

- **Intent Routing Worker**: NEW queue processor
  - `src/workers/intent-routing.ts` - Processes intent-routing queue
  - Fetches analysis results from SQLite
  - Calls `classifyIntent()` with summary + OCR text
  - Updates database with intent labels and confidence score
  - Routes based on classification:
    - `event_flyer` + confidence ≥ 0.7 → Marked ready for Browserbase (Phase 3)
    - Other types → No automated action, available for search/review
  - Concurrency: 2 concurrent jobs
  - Full Weave tracing for routing decisions

- **Worker Tracing**: Added Weave attributes to all workers
  - `src/workers/image-upload.ts` - Logs operation, contentHash, mediaType, hasLocation
  - `src/workers/image-analysis.ts` - Logs operation, assetId, analysis results
  - All operations traced for end-to-end observability

### Processing Flow (Updated)
```
macOS PhotoKit
  ↓ Extract metadata + compress image (70% JPEG)
  ↓ Compute SHA-256 hash
  ↓ POST /api/assets/upload (multipart/form-data)
Node Server (Bull Queue: 'image-upload')
  ↓ [TRACED] Check: contentHash exists in SQLite?
  ↓ YES → Skip (dedupe) | NO → Store + enqueue 'image-analysis'
Node Server (Bull Queue: 'image-analysis', concurrency: 4)
  ↓ [TRACED] Fetch image from SQLite
  ↓ [TRACED] Call Ollama: OCR + summary + embedding
  ↓ Update SQLite with results
  ↓ Enqueue 'intent-routing'
Node Server (Bull Queue: 'intent-routing', concurrency: 2) [NEW]
  ↓ [TRACED] Fetch summary + OCR from SQLite
  ↓ [TRACED] Call Ollama: classify intent
  ↓ Update SQLite with intentLabels + confidence
  ↓ IF event_flyer + confidence ≥ 0.7 → Mark ready for Browserbase
  ↓ ELSE → No automated action
```

### Intent Types
1. **event_flyer**: Event posters, flyers, invitations
   - Indicators: dates, times, venues, RSVP links, QR codes, event titles
   - High confidence (≥0.7) → Queued for Browserbase processing (Phase 3)

2. **general_photo**: Regular photographs
   - Personal photos, scenic views, portraits, group photos
   - Screenshots of non-event content

3. **other**: Everything else
   - Receipts, documents, articles, memes, abstract images

### Weave Traces Captured
All operations now generate Weave traces with the following spans:
- **Image Upload**: contentHash, deviceId, mediaType, hasLocation
- **Image Analysis**: model name, image size, summary length, OCR length, embedding dimension
- **Intent Classification**: intent type, confidence, reasoning
- **Intent Routing**: routing decision, readiness for Browserbase

### Benefits
✅ Full observability of every photo → intent workflow  
✅ Debug failures by viewing Weave traces in UI  
✅ Track success rates for intent classification  
✅ Compare confidence scores across different photo types  
✅ Identify bottlenecks in processing pipeline  
✅ Automatic routing of event flyers to Phase 3 (when implemented)

### Configuration
- **Weave API Key**: Set `WEAVE_API_KEY` in `.env` file
- **Weave Project**: `photo-agent` (hardcoded in `initWeave()`)
- **Confidence Threshold**: 0.7 for event flyer routing (configurable in `intent-routing.ts`)

### Package Dependencies
- **weave**: TypeScript SDK for observability (`npm install weave`)
- Automatic tracing of supported libraries (OpenAI, etc.)

### Files Created/Updated
**New:**
- `photo-agent-server/src/services/weave.ts` ✅
- `photo-agent-server/src/workers/intent-routing.ts` ✅

**Updated:**
- `photo-agent-server/src/services/ollama.ts` ✅ (added `classifyIntent()` + tracing)
- `photo-agent-server/src/workers/index.ts` ✅ (initialize Weave)
- `photo-agent-server/src/workers/image-upload.ts` ✅ (added tracing)
- `photo-agent-server/src/workers/image-analysis.ts` ✅ (added tracing)
- `photo-agent-server/src/index.ts` ✅ (initialize Weave on startup)
- `photo-agent-server/package.json` ✅ (added `weave` dependency)

### Next Steps (Phase 3)
- Milestone I: Browserbase integration
- Milestone J: Flyer detection + event extraction (web enrichment)
- Milestone K: Web search for canonical event page
- Milestone L: RSVP form completion
- Milestone M: Calendar integration

---

## [#3] iOS App Foundation + Pairing (Milestone O)
**Date:** Feb 1, 2026  
**Type:** New Feature  
**Milestone:** O (iOS App Foundation + Pairing)

### Summary
Implemented iOS app foundation with QR code pairing, secure tunnel connection, and device registration. The app can now pair with the macOS server via Cloudflare tunnel and maintain a secure connection.

### Changes

#### iOS App (NEW)
- **Models**: iOS-specific state management
  - `Models/AppState.swift` - Connection status, pairing state, device ID
  - Tracks: isPaired, connectionStatus, tunnelURL, deviceId
  - Manages: ConnectionManager lifecycle

- **Utilities**: Secure storage
  - `Utilities/KeychainHelper.swift` - Keychain wrapper for tunnel URL
  - Save/retrieve/delete operations
  - Secure storage for sensitive data

- **Managers**: Connection handling
  - `Managers/ConnectionManager.swift` - Pairing and server communication
  - QR code pairing flow (scan → test → store → register)
  - Health check testing (`/health` endpoint)
  - Device registration (`POST /api/devices`)
  - Polling for approvals (10-second interval, placeholder)

- **Views**: User interface
  - `Views/PairingView.swift` - Initial pairing screen
    - QR scanner with camera access
    - Manual URL entry fallback
    - Error handling and status display
  - `Views/QRScannerViewRepresentable.swift` - AVFoundation QR scanner
    - UIKit bridge for camera/QR detection
    - Automatic scanning and URL extraction
  - `Views/ConnectionStatusView.swift` - Connection health indicator
    - Status dot (green/red/orange/gray)
    - Tunnel URL display
    - Unpair device action
  - `Views/MainTabView.swift` - Main app tabs
    - Inbox tab (placeholder for Milestone Q)
    - Search tab (placeholder for Milestone Q)
    - Settings tab (connection status + device info)

- **App Updates**:
  - `ContentView.swift` - Routes to pairing or main app based on paired state
  - `photo_agent_iosApp.swift` - App entry point with UIDevice extension

- **Documentation**:
  - `IOS_SETUP.md` - Comprehensive setup guide
    - Camera permission instructions
    - Pairing flow details
    - Troubleshooting tips

#### Server (UPDATED)
- **Device Registration**: New endpoint for iOS/macOS device tracking
  - `src/routes/devices.ts` - Device CRUD operations
    - `POST /api/devices` - Register device
    - `GET /api/devices` - List all devices
    - `PATCH /api/devices/:id` - Update last seen timestamp
  
- **Database**: Added devices table
  - `src/db/sqlite.ts` - Updated schema
  - Fields: deviceId (PK), deviceType, deviceName, systemVersion, lastSeen, createdAt
  - Indexes: deviceType, lastSeen

- **Server Integration**:
  - `src/index.ts` - Added devices router to Express app

### Pairing Flow
1. iOS app launches → Check if paired (Keychain lookup)
2. If not paired → Show PairingView with QR scanner
3. Scan QR from macOS Status Dashboard
4. Extract tunnel URL from QR code
5. Test connection with `/health` endpoint
6. If successful → Store URL in Keychain
7. Register device with server: `POST /api/devices`
8. Navigate to MainTabView (Inbox, Search, Settings)
9. Start polling for approvals (10-second interval)

### Implementation Decisions
- **Models not shared**: Duplicated between iOS/macOS (refactor later for simplicity)
- **Polling over SSE**: 10-second polling as fallback (SSE added later in Milestone R)
- **Keychain security**: Tunnel URL stored securely in iOS Keychain
- **Graceful degradation**: Device registration fails silently if endpoint unavailable
- **Manual fallback**: Manual URL entry if QR scanning fails

### Manual Setup Required
- Add `NSCameraUsageDescription` to Info.plist for QR scanner:
  ```xml
  <key>NSCameraUsageDescription</key>
  <string>We need camera access to scan the QR code from your Mac</string>
  ```

### Files Created/Updated
**iOS:**
- `photo-agent-ios/Models/AppState.swift` ✅
- `photo-agent-ios/Utilities/KeychainHelper.swift` ✅
- `photo-agent-ios/Managers/ConnectionManager.swift` ✅
- `photo-agent-ios/Views/PairingView.swift` ✅
- `photo-agent-ios/Views/QRScannerViewRepresentable.swift` ✅
- `photo-agent-ios/Views/ConnectionStatusView.swift` ✅
- `photo-agent-ios/Views/MainTabView.swift` ✅
- `photo-agent-ios/ContentView.swift` ✅ (updated)
- `photo-agent-ios/photo_agent_iosApp.swift` ✅ (updated)
- `photo-agent-ios/IOS_SETUP.md` ✅

**Server:**
- `photo-agent-server/src/routes/devices.ts` ✅
- `photo-agent-server/src/db/sqlite.ts` ✅ (updated)
- `photo-agent-server/src/index.ts` ✅ (updated)

### Next Steps
- Milestone P: iOS photo upload + monitoring
- Milestone Q: iOS approvals + search UI
- Milestone R: WebSocket/SSE real-time updates

---

## [#2] Architecture Refactor: Centralized Image Analysis
**Date:** Feb 1, 2026  
**Type:** Major Refactor  
**Milestones:** D (refactored), E (completed), F (completed)

### Summary
Migrated from client-side image analysis to centralized server-side analysis. This major architectural change simplifies iOS integration, improves scalability, and provides better job queue management.

### Changes

#### Server (NEW)
- **Database**: Added SQLite with WAL mode for persistent storage
  - `src/db/sqlite.ts` - Database setup with asset schema
  - Stores: metadata, image data (compressed JPEG), OCR, summaries, embeddings
  - Indexes: contentHash, creationDate, deviceId, photoLibraryId

- **Ollama Service**: Centralized image analysis
  - `src/services/ollama.ts` - Vision + embedding models
  - Analyzes images server-side via Ollama HTTP API
  - Models: `qwen3-vl:8b` (vision), `nomic-embed-text` (embeddings)

- **Queue Service**: Bull queues with Redis
  - `src/services/queue.ts` - Three queues (upload, analysis, intent routing)
  - Bull Board UI at `/admin/queues` for monitoring
  - Configurable concurrency (4 concurrent analyses)

- **Routes**: RESTful asset endpoints
  - `src/routes/assets.ts` - Upload, get, delete, queue status
  - `POST /api/assets/upload` - Multipart form-data with image
  - `GET /api/assets` - List assets with pagination
  - `GET /api/assets/:id` - Get single asset
  - `GET /api/assets/:id/image` - Get image data
  - `DELETE /api/assets/:id` - Delete asset
  - `GET /api/assets/queue/status` - Queue health

- **Workers**: Separate process for job processing
  - `src/workers/index.ts` - Workers entry point
  - `src/workers/image-upload.ts` - Upload queue worker (dedupe + store)
  - `src/workers/image-analysis.ts` - Analysis worker (4 concurrent)

- **Main Server**: Updated integration
  - `src/index.ts` - Integrated new services and Bull Board
  - Deprecated old `/api/assets` JSON endpoint

- **Package Scripts**: Concurrent server + workers
  - `npm run dev` - Runs both server and workers concurrently
  - `npm run dev:server` - Server only
  - `npm run dev:workers` - Workers only

#### macOS App (UPDATED)
- **UserAsset Model**: Added content hash field
  - `Models/UserAsset.swift` - New `contentHash: String?` field for SHA-256

- **PhotosManager**: Image upload with compression
  - `Managers/PhotosManager.swift` - Updated to upload image data
  - Fetches full image from PHAsset
  - Compresses to 70% JPEG quality
  - Computes SHA-256 hash
  - Uploads via multipart/form-data to `/api/assets/upload`

- **ModelManager**: Simplified to status checks
  - `Managers/ModelManager.swift` - Removed analysis logic
  - Kept `checkOllamaStatus()` for UI display
  - Removed: `analyzePhotos()`, `analyzeSummaryAndOCR()`, `generateEmbedding()`

- **UI Updates**: Queue status display
  - `Views/StatusDashboardView.swift` - Removed "Analyze Photos" button
  - Shows server queue status instead of manual analysis
  - Updated text: "Analysis happens automatically on the server"

### Benefits
✅ Single analysis pipeline (no iOS/macOS duplication)  
✅ Automatic deduplication via SHA-256 content hash  
✅ Better job queue management with Bull  
✅ Bull Board UI for monitoring queues  
✅ Server as single source of truth  
✅ Simpler iOS integration (upload only, no Ollama client needed)  
✅ Scalable (4 concurrent analyses, easily configurable)

### Migration Notes
- **Old endpoint deprecated**: `POST /api/assets` (JSON metadata only) → returns 400 with migration message
- **New endpoint**: `POST /api/assets/upload` (multipart with image data)
- **Prerequisites**: Redis must be running (`brew services start redis`)
- **Startup**: Use `npm run dev` to start both server and workers

### Breaking Changes
- macOS app no longer performs local analysis
- Old `/api/assets` endpoint deprecated (returns 400 error with instructions)
- Requires Redis to be running for queue functionality

---

## [#1] Initial Foundation (Milestones A-D)
**Date:** Jan 31, 2026  
**Type:** Initial Implementation  
**Milestones:** A (Server), B (Tunnel), C (Photos), D (Models - original)

### Summary
Built macOS app foundation with server lifecycle management, Cloudflare tunnel, Photos library access, and local Ollama integration (later refactored).

### Changes
- Server lifecycle management (spawn/monitor Node.js server)
- Cloudflare tunnel with QR code generation for iOS pairing
- Photos library authorization and scanning (1000 photos default)
- Local Ollama model integration (refactored in #2)

See PROGRESS.md for detailed milestone documentation.