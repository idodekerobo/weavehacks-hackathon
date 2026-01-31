# Photos-as-Intent Agent — Progress Tracker

**Last Updated:** Jan 31, 2026

---

## Overall Status

| Component | Status | Notes |
|-----------|--------|-------|
| macOS App | 🟡 In Progress | Server + Tunnel done, Photos + Models pending |
| iOS App | 🔴 Not Started | Placeholder UI only |
| Node Server | 🟡 In Progress | Basic routes, needs Redis/Weave/Browserbase |
| Admin Dashboard | 🔴 Not Started | Placeholder UI only |

---

## Milestone Overview

### Phase 1: Foundation (macOS App Core)
| Milestone | Status | Description |
|-----------|--------|-------------|
| A | ✅ Complete | Server lifecycle management |
| B | ✅ Complete | Cloudflare tunnel management |
| C | 🔴 Not Started | Photos library access (PhotoKit) |
| D | 🔴 Not Started | Local model integration (Ollama) |

### Phase 2: Intent Pipeline (Server + Processing)
| Milestone | Status | Description |
|-----------|--------|-------------|
| E | 🔴 Not Started | UserAsset model + server endpoints |
| F | 🔴 Not Started | Redis queue integration |
| G | 🔴 Not Started | Weave observability |
| H | 🔴 Not Started | Photo → Intent processing pipeline |

### Phase 3: Skills & Actions (Web Automation)
| Milestone | Status | Description |
|-----------|--------|-------------|
| I | 🔴 Not Started | Browserbase integration |
| J | 🔴 Not Started | Flyer detection + event extraction |
| K | 🔴 Not Started | Web search for canonical event |
| L | 🔴 Not Started | RSVP form completion |
| M | 🔴 Not Started | Calendar integration |

### Phase 4: Consumer Experience
| Milestone | Status | Description |
|-----------|--------|-------------|
| N | 🔴 Not Started | macOS approvals inbox UI |
| O | 🔴 Not Started | iOS pairing + upload |
| P | 🔴 Not Started | iOS approvals + search |
| Q | 🔴 Not Started | Notifications (push/local) |

### Phase 5: Demo Polish
| Milestone | Status | Description |
|-----------|--------|-------------|
| R | 🔴 Not Started | Admin dashboard live runs |
| S | 🔴 Not Started | Admin Browserbase Live View |
| T | 🔴 Not Started | End-to-end demo flow |

### Nice-to-Have
| Milestone | Status | Description |
|-----------|--------|-------------|
| V1 | 🔴 Not Started | Voice approvals (Daily/Pipecat) |
| V2 | 🔴 Not Started | Marimo mission control |

---

## Detailed Milestone Breakdown

### ✅ Milestone A: Server Lifecycle Management
**Status:** Complete  
**Completed:** Jan 31, 2026

**What was built:**
- `ServerManager.swift` - Spawns and monitors Node.js server
- Health check polling at `/health` endpoint
- Graceful shutdown with SIGTERM
- Error handling for common issues (port in use, Node not found)

**Files:**
- `photo-agent-macos/Managers/ServerManager.swift`
- `photo-agent-macos/Models/AppState.swift`

---

### ✅ Milestone B: Tunnel Management
**Status:** Complete  
**Completed:** Jan 31, 2026

**What was built:**
- `TunnelManager.swift` - Spawns and monitors cloudflared
- Quick tunnel support (trycloudflare.com URLs)
- QR code generation for iOS pairing
- Copy URL to clipboard

**Files:**
- `photo-agent-macos/Managers/TunnelManager.swift`
- `photo-agent-macos/Views/StatusDashboardView.swift`

**Prerequisites resolved:**
- Disabled App Sandbox for process spawning
- Hardcoded Node path for NVM compatibility

---

### 🔴 Milestone C: Photos Library Access
**Status:** Not Started

**Goals:**
- Request PhotoKit read authorization
- Fetch photos from user's library
- Extract metadata (date taken, location, etc.)
- Display photos in macOS app UI

**Files to implement:**
- `photo-agent-macos/Managers/PhotosManager.swift`
- Add `NSPhotoLibraryReadUsageDescription` to Info.plist

**Key APIs:**
- `PHPhotoLibrary.requestReadWriteAuthorization()`
- `PHAsset`, `PHFetchOptions`, `PHImageManager`

---

### 🔴 Milestone D: Local Model Integration (Ollama)
**Status:** Not Started

**Goals:**
- Check Ollama installation
- Call Ollama REST API for vision analysis
- Extract OCR text from images
- Generate embeddings for similarity search

**Files to implement:**
- `photo-agent-macos/Managers/ModelManager.swift`

**Prerequisites:**
- User must install Ollama: `brew install ollama`
- User must pull models: `ollama pull llava:13b`, `ollama pull nomic-embed-text`

**Key endpoints:**
- `POST http://localhost:11434/api/generate` (with images)
- `POST http://localhost:11434/api/embeddings`

---

### 🔴 Milestone E: UserAsset Model + Server Endpoints
**Status:** Not Started

**Goals:**
- Define UserAsset TypeScript interface on server
- Create CRUD endpoints for UserAssets
- Store in memory initially (later: Redis/SQLite)

**Files to implement:**
- `photo-agent-server/src/models/UserAsset.ts`
- `photo-agent-server/src/routes/assets.ts`

**Endpoints:**
- `POST /api/assets` - Create new asset
- `GET /api/assets` - List all assets
- `GET /api/assets/:id` - Get single asset
- `PATCH /api/assets/:id` - Update asset
- `DELETE /api/assets/:id` - Delete asset

---

### 🔴 Milestone F: Redis Queue Integration
**Status:** Not Started

**Goals:**
- Connect to Redis
- Create job queues: ingestion, enrichment, action
- Implement state machine for job lifecycle
- Dedupe logic for duplicate photos

**Prerequisites:**
- Redis running locally: `brew install redis && brew services start redis`

**Key packages:**
- `ioredis` or `redis` npm package
- `bull` or `bullmq` for job queues

---

### 🔴 Milestone G: Weave Observability
**Status:** Not Started

**Goals:**
- Initialize Weave client
- Create traces for each photo processing run
- Add spans for: ingestion, extraction, routing, action
- Log system prompt versions

**Prerequisites:**
- Weave API key in `.env`

**Key integration points:**
- Wrap all LLM calls with Weave spans
- Log extraction results
- Track approval/rejection events

---

### 🔴 Milestone H: Photo → Intent Pipeline
**Status:** Not Started

**Goals:**
- Orchestrate: Photo → OCR → Classification → UserAsset
- Route based on detected intent type
- Queue for downstream enrichment

**Flow:**
1. Photo ingested (from macOS library or iOS upload)
2. Ollama extracts OCR text
3. Ollama classifies intent (event_flyer, receipt, screenshot, etc.)
4. Create UserAsset with extracted data
5. Queue for enrichment if actionable

---

### 🔴 Milestone I: Browserbase Integration
**Status:** Not Started

**Goals:**
- Initialize Browserbase client
- Create browser sessions
- Navigate to URLs
- Extract page content
- Take screenshots for evidence

**Prerequisites:**
- Browserbase API key in `.env`

---

### 🔴 Milestone J: Flyer Detection + Event Extraction
**Status:** Not Started

**Goals:**
- Identify event flyers with high confidence
- Extract: event name, date, time, location, URL
- Handle ambiguous dates/times
- QR code detection and decoding

---

### 🔴 Milestone K: Web Search for Canonical Event
**Status:** Not Started

**Goals:**
- Search web for extracted event details
- Find canonical event page (Eventbrite, Luma, Meetup, etc.)
- Verify extracted details match
- Handle "couldn't find" case gracefully

---

### 🔴 Milestone L: RSVP Form Completion
**Status:** Not Started

**Goals:**
- Navigate to event page
- Fill RSVP/registration form
- Handle CAPTCHAs (offer Live View takeover)
- Capture confirmation screenshots

---

### 🔴 Milestone M: Calendar Integration
**Status:** Not Started

**Goals:**
- Create calendar events via EventKit
- Include: title, date/time, location, link
- Handle timezone correctly
- Avoid duplicate calendar entries

---

### 🔴 Milestone N: macOS Approvals Inbox
**Status:** Not Started

**Goals:**
- Display pending approvals in macOS app
- Show: source image, extracted details, proposed action
- Approve/Edit/Reject buttons
- Mark as complete after action

---

### 🔴 Milestone O: iOS Pairing + Upload
**Status:** Not Started

**Goals:**
- Scan QR code to get tunnel URL
- Store URL securely
- Auto-upload new photos to server
- Handle offline gracefully

---

### 🔴 Milestone P: iOS Approvals + Search
**Status:** Not Started

**Goals:**
- Display approval cards
- Natural language search over UserAssets
- Results as "intent cards" with images

---

### 🔴 Milestone Q: Notifications
**Status:** Not Started

**Goals:**
- Push notifications for pending approvals
- Local notifications for completed actions
- iOS + macOS notification support

---

### 🔴 Milestone R: Admin Dashboard Live Runs
**Status:** Not Started

**Goals:**
- Real-time list of agent runs
- Status: queued/running/waiting/succeeded/failed
- Link to Weave trace for each run

---

### 🔴 Milestone S: Admin Browserbase Live View
**Status:** Not Started

**Goals:**
- Embed Browserbase Live View in dashboard
- Show active browser sessions
- Link to session recordings

---

### 🔴 Milestone T: End-to-End Demo Flow
**Status:** Not Started

**Goals:**
- Polish the 2-3 minute demo
- Test with real event flyers
- Prepare backup plan for failures

---

## Configuration Reference

| Setting | Value | File |
|---------|-------|------|
| Server Port | 1738 | `.env`, `AppState.swift` |
| Node Path | `/Users/idodekerobo/.nvm/versions/node/v20.17.0/bin/node` | `ServerManager.swift` |
| Server Path | `/Users/.../weavehacks/photo-agent-server` | `ServerManager.swift` |
| Tunnel Name | `photo-agent` | `TunnelManager.swift` |

---

## Sponsor Tool Integration Status

| Tool | Status | Usage |
|------|--------|-------|
| **Weave** | 🔴 Not Integrated | Observability for all agent runs |
| **Browserbase** | 🔴 Not Integrated | Web automation for RSVP flows |
| **Redis** | 🔴 Not Integrated | Queue + state machine + dedupe |
| Daily/Pipecat | 🔴 Not Started | Voice approvals (nice-to-have) |
| Marimo | 🔴 Not Started | Mission control (nice-to-have) |

---

## Quick Commands

```bash
# Start server manually
cd photo-agent-server && npm run dev

# Start tunnel manually  
cloudflared tunnel --url http://localhost:1738

# Check port usage
lsof -i :1738

# Kill process on port
kill -9 $(lsof -ti :1738)

# Install Ollama models
ollama pull llava:13b
ollama pull nomic-embed-text

# Start Redis
brew services start redis
```

---

## Notes & Decisions

1. **Port changed to 1738** - Avoids conflicts with common dev ports (3000, 3001)
2. **App Sandbox disabled** - Required for spawning Node/cloudflared processes
3. **Node path hardcoded** - NVM paths not visible to GUI apps; needs improvement later
4. **Using quick tunnels** - No Cloudflare account domain needed; URL changes on restart
5. **Ollama for local models** - Easiest setup; can migrate to llama.cpp later

---

## Files Structure

```
weavehacks/
├── photo-agent-macos/           # macOS app (Swift)
│   └── photo-agent-macos/
│       ├── Models/
│       │   ├── AppState.swift   ✅
│       │   └── UserAsset.swift  🔴
│       ├── Managers/
│       │   ├── ServerManager.swift  ✅
│       │   ├── TunnelManager.swift  ✅
│       │   ├── PhotosManager.swift  🔴
│       │   └── ModelManager.swift   🔴
│       └── Views/
│           ├── StatusDashboardView.swift  ✅
│           ├── ApprovalInboxView.swift    🔴
│           └── SettingsView.swift         🔴
├── photo-agent-ios/             # iOS app (Swift)
│   └── (placeholder UI only)    🔴
├── photo-agent-server/          # Node.js server
│   └── src/
│       ├── index.ts             ✅ (basic routes)
│       ├── models/              🔴
│       └── routes/              🔴
├── admin-dashboard/             # Next.js dashboard
│   └── (placeholder UI only)    🔴
└── docs/
    ├── PRD.md                   📋 Reference
    ├── PROGRESS.md              📋 This file
    └── MILESTONE_AB_COMPLETE.md ✅ Done
```

Legend: ✅ Complete | 🟡 In Progress | 🔴 Not Started | 📋 Documentation
