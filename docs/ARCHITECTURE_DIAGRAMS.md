# Architecture Diagrams

## Current Architecture (Pre-Refactor)

```
┌─────────────────────────────────────────────────────────────┐
│                      macOS App                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ PhotosManager│  │ ModelManager │  │StatusDashboard│      │
│  │              │  │              │  │              │      │
│  │ - Scan photos│  │ - Call Ollama│  │ - Show status│      │
│  │ - Extract    │  │ - Analyze    │  │ - Buttons    │      │
│  │   metadata   │  │   images     │  │              │      │
│  └──────┬───────┘  └──────┬───────┘  └──────────────┘      │
│         │                  │                                 │
│         │ POST /api/assets │                                 │
│         │  (metadata only) │                                 │
└─────────┼──────────────────┼─────────────────────────────────┘
          │                  │
          ↓                  ↓
┌─────────────────────────────────────────────────────────────┐
│                    Node Server                               │
│  ┌────────────────────────────────────────────────────────┐ │
│  │         Express Routes (in-memory only)                 │ │
│  │  - POST /api/assets → store in memory                  │ │
│  │  - GET /api/assets → return from memory                │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
          ↓
    (No database!)
    (Analysis in Mac app)
```

---

## New Architecture (After Refactor)

```
┌─────────────────────────────────────────────────────────────┐
│                      macOS App                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ PhotosManager│  │ ModelManager │  │StatusDashboard│      │
│  │              │  │              │  │              │      │
│  │ - Scan photos│  │ - Check      │  │ - Show queue │      │
│  │ - Get image  │  │   Ollama     │  │   status     │      │
│  │   data       │  │   status     │  │ - Bull Board │      │
│  │ - SHA-256    │  │   (UI only)  │  │   link       │      │
│  │ - Compress   │  │              │  │              │      │
│  │ - Upload     │  └──────────────┘  └──────────────┘      │
│  └──────┬───────┘                                           │
│         │                                                    │
│         │ POST /api/assets/upload                           │
│         │  (multipart: image + metadata)                    │
└─────────┼────────────────────────────────────────────────────┘
          │
          ↓
┌─────────────────────────────────────────────────────────────┐
│                      iOS App                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Pairing      │  │PhotosMonitor │  │ Approvals    │      │
│  │              │  │              │  │              │      │
│  │ - QR scanner │  │ - Detect new │  │ - Show cards │      │
│  │ - Store URL  │  │   photos     │  │ - Approve/   │      │
│  │   (Keychain) │  │ - SHA-256    │  │   Reject     │      │
│  │              │  │ - Compress   │  │              │      │
│  │              │  │ - Upload     │  │              │      │
│  └──────────────┘  └──────┬───────┘  └──────────────┘      │
│                            │                                 │
│                            │ POST /api/assets/upload         │
│                            │  (via tunnel)                   │
└────────────────────────────┼─────────────────────────────────┘
                             │
          ┌──────────────────┴──────────────────┐
          │                                     │
          ↓                                     ↓
┌─────────────────────────────────────────────────────────────┐
│                    Node Server                               │
│  ┌────────────────────────────────────────────────────────┐ │
│  │                 Express Routes                          │ │
│  │  POST /api/assets/upload → Bull queue                  │ │
│  │  GET /api/assets → SQLite query                        │ │
│  │  GET /api/queue/status → Bull stats                    │ │
│  │  GET /api/events → SSE for real-time                   │ │
│  └────────────────────────────────────────────────────────┘ │
│                             ↓                                │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              Bull Queues (Redis-backed)                 │ │
│  │                                                          │ │
│  │  1. image-upload                                        │ │
│  │     - Check SHA-256 dedupe                              │ │
│  │     - Store in SQLite                                   │ │
│  │     - Enqueue image-analysis                            │ │
│  │                                                          │ │
│  │  2. image-analysis (4 concurrent)                       │ │
│  │     - Fetch from SQLite                                 │ │
│  │     - Call Ollama → OCR + summary + embedding           │ │
│  │     - Update SQLite                                     │ │
│  │     - Enqueue intent-routing                            │ │
│  │                                                          │ │
│  │  3. intent-routing                                      │ │
│  │     - Classify intent type                              │ │
│  │     - Route to skill queues                             │ │
│  │                                                          │ │
│  │  4. web-enrichment (for events)                         │ │
│  │     - Browserbase search                                │ │
│  │     - Create approval                                   │ │
│  │                                                          │ │
│  │  5. action-execution (after approval)                   │ │
│  │     - Execute action                                    │ │
│  │     - Send notifications                                │ │
│  └────────────────────────────────────────────────────────┘ │
│                             ↓                                │
│  ┌────────────────────────────────────────────────────────┐ │
│  │                   SQLite Database                        │ │
│  │  - assets table (metadata + embeddings + images)       │ │
│  │  - approvals table (pending actions)                   │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │                 Ollama Service                          │ │
│  │  - analyzeSummaryAndOCR(imageData)                     │ │
│  │  - generateEmbedding(text)                             │ │
│  │  → Calls localhost:11434                               │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
          ↓
    (Ollama on Mac)
```

---

## Data Flow: iPhone Screenshot → Approval

```
┌─────────────┐
│ User takes  │
│ screenshot  │
│ on iPhone   │
└──────┬──────┘
       │
       ↓
┌─────────────────────────────────┐
│ iOS PhotosMonitor detects       │
│ - New photo via PHObserver      │
│ - Extract metadata              │
│ - Get image data                │
│ - Compute SHA-256: abc123...    │
│ - Compress to 70% JPEG          │
└──────┬──────────────────────────┘
       │
       │ POST /api/assets/upload
       │ (via Cloudflare tunnel)
       │ multipart: {
       │   image: <compressed JPEG>,
       │   photoLibraryId: "...",
       │   contentHash: "abc123...",
       │   deviceId: "iPhone",
       │   ... metadata
       │ }
       ↓
┌─────────────────────────────────┐
│ Node Server                     │
│ Bull Queue: image-upload        │
│ - Receive upload                │
│ - Check: SELECT * FROM assets  │
│   WHERE contentHash = 'abc123'  │
│ - Not found → Insert into DB   │
│ - Enqueue: image-analysis       │
└──────┬──────────────────────────┘
       │
       ↓
┌─────────────────────────────────┐
│ Bull Queue: image-analysis      │
│ (Worker picks up job)           │
│ - Fetch image from SQLite       │
│ - Call Ollama:                  │
│   • Summary: "Event flyer..."   │
│   • OCR: "Tech Meetup..."       │
│   • Embedding: [0.1, 0.2, ...]  │
│ - UPDATE assets SET...          │
│ - Enqueue: intent-routing       │
└──────┬──────────────────────────┘
       │
       ↓
┌─────────────────────────────────┐
│ Bull Queue: intent-routing      │
│ - Classify: "event_flyer"       │
│ - Confidence: 0.95              │
│ - Enqueue: web-enrichment       │
└──────┬──────────────────────────┘
       │
       ↓
┌─────────────────────────────────┐
│ Bull Queue: web-enrichment      │
│ - Browserbase search            │
│ - Find canonical event page     │
│ - Extract details               │
│ - INSERT INTO approvals         │
│ - SSE broadcast: "approval"     │
└──────┬──────────────────────────┘
       │
       ↓
┌─────────────────────────────────┐
│ iOS App (SSE listener)          │
│ - Receives: approval event      │
│ - Fetch: GET /api/approvals     │
│ - Show: Approval card           │
│ - User taps: "Approve"          │
│ - PATCH /api/approvals/123      │
│   { status: "approved" }        │
└──────┬──────────────────────────┘
       │
       ↓
┌─────────────────────────────────┐
│ Bull Queue: action-execution    │
│ - Browserbase: Complete RSVP    │
│ - EventKit: Add to calendar     │
│ - UPDATE approvals              │
│ - SSE broadcast: "completed"    │
└──────┬──────────────────────────┘
       │
       ↓
┌─────────────────────────────────┐
│ iOS App                         │
│ - Show: "RSVP confirmed ✓"     │
│ - Calendar event appears        │
└─────────────────────────────────┘

Total time: ~10-30 seconds
(depends on iCloud sync + Ollama speed)
```

---

## Component Responsibilities

### macOS App
- ✅ Scan photo library (first-time bulk)
- ✅ Extract image data
- ✅ Compute SHA-256 hash
- ✅ Compress images (70% JPEG)
- ✅ Upload to Node server
- ✅ Display Ollama status (UI only)
- ✅ Show queue stats (from server)
- ❌ NO analysis (moved to server)

### iOS App
- ✅ Pair with macOS (QR code)
- ✅ Monitor new photos (PHObserver)
- ✅ Extract + compress + hash images
- ✅ Upload to Node server (via tunnel)
- ✅ Display approvals
- ✅ Search functionality
- ✅ Real-time updates (SSE)

### Node Server
- ✅ HTTP API (Express)
- ✅ SQLite database (persistent storage)
- ✅ Bull queues (job processing)
- ✅ Ollama service (analysis)
- ✅ Browserbase integration (future)
- ✅ WebSocket/SSE (real-time)
- ✅ Bull Board (monitoring UI)

### Redis
- ✅ Bull queue backing store
- ✅ Job state persistence
- ✅ Retry logic
- ✅ Concurrency control

### Ollama
- ✅ Vision model (qwen3-vl:8b)
- ✅ Embedding model (nomic-embed-text)
- ✅ Runs on Mac Silicon
- ✅ Called by Node server

---

## Why This Architecture?

### Problem with Old Architecture
1. **Duplication**: Had to implement Ollama client twice (Swift + TypeScript)
2. **Tight Coupling**: Node server useless without Mac app running
3. **Poor iOS Integration**: iOS would need own Ollama client (complex)
4. **No Job Queue**: Manual parallelism in Swift (harder to manage)

### Benefits of New Architecture
1. **Single Pipeline**: One Ollama integration (TypeScript)
2. **Consistent**: iOS and macOS treated identically
3. **Better Queues**: Bull provides retry, concurrency, monitoring
4. **Easier Tracing**: All analysis in one place (good for Weave)
5. **Simpler Apps**: Just upload images, no orchestration logic
6. **Scalability**: Could add more workers, different devices

### Trade-offs
| Aspect | Old | New |
|--------|-----|-----|
| Image upload | No | Yes (compressed) |
| Network usage | Low | Higher |
| Mac app complexity | High | Low |
| Server complexity | Low | Higher |
| iOS difficulty | Very Hard | Moderate |
| Scalability | Poor | Good |
| Weave tracing | Hard | Easy |

**Verdict:** New architecture is better for hackathon goals (iOS support, observability, demo).
