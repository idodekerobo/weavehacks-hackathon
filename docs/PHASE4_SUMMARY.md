# Phase 4 Implementation Plan - Executive Summary

**Date:** Feb 1, 2026  
**Prepared by:** AI Assistant  
**Status:** Ready for Implementation

---

## Overview

You're starting Phase 4 (iOS and macOS consumer experience) while concurrently refactoring Milestone D/E (moving image analysis to Node server). This document summarizes all decisions, documents created, and next steps.

---

## Key Architectural Decisions (Your Answers)

| Question | Your Answer | Implication |
|----------|-------------|-------------|
| iCloud Photos enabled? | ✅ Yes | Required for cross-device photo syncing |
| iOS upload strategy | Full image upload (Option B) | iOS uploads compressed JPEG to Node server |
| iOS processing scope | New photos only (Option A) | Only monitor photos captured post-pairing |
| Analysis location | Node server (Option B2) | Centralized analysis pipeline, simpler iOS |
| Duplicate detection | Auto-dedupe by SHA-256 | No user prompts, automatic deduplication |
| Real-time updates | WebSocket/SSE | Server-Sent Events for approval notifications |
| Offline handling | Bull queues + caching | iOS caches uploads, retries when online |

---

## Documents Created

### 1. `docs/REFACTOR_PLAN.md` (Most Important)
**Purpose:** Step-by-step refactor guide for Milestone D/E  
**Contents:**
- Current vs. new architecture diagrams
- Phase 1: Server foundation (SQLite, Bull, Ollama service)
- Phase 2: Mac app refactor (image upload, SHA-256 hashing)
- Phase 3: iOS implementation
- Testing checklist
- Timeline: 14-21 hours total

**Start here for implementation!**

### 2. `docs/MODELMANAGER_CHANGES.md`
**Purpose:** Specific changes needed for ModelManager.swift  
**Contents:**
- What to keep (status check only)
- What to remove (entire analysis pipeline)
- New simplified version (~90 lines vs 379 lines)
- StatusDashboardView updates
- Testing procedures

**Use this when refactoring Mac app!**

### 3. `docs/PROGRESS.md` (Updated)
**Purpose:** Milestone tracking with Phase 4 details  
**Updates:**
- Milestone D marked as "Needs Refactor"
- Milestone E updated with Bull queue architecture
- Milestone F merged with E
- Phase 4 milestones (N, O, P, Q, R) detailed with:
  - macOS Approvals Inbox UI
  - iOS Pairing + Foundation
  - iOS Photo Upload + Monitoring
  - iOS Approvals + Search UI
  - WebSocket/SSE Real-Time Updates
- Added refactor note at top of detailed section
- Updated notes & decisions section

### 4. `docs/PRD.md` (Updated)
**Purpose:** Product requirements reflecting new architecture  
**Updates:**
- Photo processing architecture section updated
- iOS processing stance updated
- Centralized analysis via Node server documented
- Image compression (70% JPEG) documented
- SHA-256 deduplication documented
- WebSocket/SSE for real-time updates documented

---

## Implementation Sequence (Recommended)

### Step 1: Server Foundation (4-6 hours)
**Goal:** Set up SQLite + Bull queues + Ollama service in Node server

**Tasks:**
1. Install dependencies: `better-sqlite3`, `bull`, `multer`, `@bull-board/express`
2. Create `src/db/sqlite.ts` - database schema
3. Create `src/services/ollama.ts` - Ollama client (move logic from ModelManager)
4. Create `src/services/queue.ts` - Bull queue setup
5. Create `src/routes/assets.ts` - multipart upload endpoint
6. Create `src/workers/image-upload.ts` - upload queue worker
7. Create `src/workers/image-analysis.ts` - analysis queue worker
8. Update `src/index.ts` - wire everything together

**Validation:**
- Server starts without errors
- Bull Board accessible at `http://localhost:1738/admin/queues`
- SQLite database created at `photo-agent-server/data/photos.db`

### Step 2: Mac App Refactor (2-3 hours)
**Goal:** Update Mac app to upload images instead of analyzing them

**Tasks:**
1. Add `contentHash` field to `UserAsset.swift`
2. Update `PhotosManager.swift`:
   - Add `getImageData()` method
   - Add `compressImage()` method
   - Add `computeSHA256()` method (CryptoKit)
   - Change `sendToServer()` to multipart upload
3. Simplify `ModelManager.swift`:
   - Remove analysis methods (keep status check only)
   - Reduce from 379 lines to ~90 lines
4. Update `StatusDashboardView.swift`:
   - Remove "Analyze Photos" button
   - Add "View Queue Status" button (opens Bull Board)
   - Add queue stats display (fetch from server API)

**Validation:**
- Photos upload successfully to server
- Bull Board shows jobs processing
- SQLite database contains uploaded images
- Ollama analysis completes (check Bull Board + database)

### Step 3: iOS Foundation + Pairing (3-4 hours)
**Goal:** Set up iOS app structure and pairing flow

**Tasks:**
1. Create shared Swift package `photo-agent-shared`:
   - Move `UserAsset.swift`
   - Create `Approval.swift`
   - Create `ImageHasher.swift`
2. Update macOS and iOS apps to import shared package
3. Create `ConnectionManager.swift` (iOS) - tunnel endpoint management
4. Create `PairingView.swift` (iOS) - QR scanner
5. Update macOS `StatusDashboardView` - show QR code for pairing
6. Test pairing flow

**Validation:**
- QR code appears on macOS
- iOS can scan QR code
- Tunnel endpoint saved in Keychain
- Connection health check succeeds

### Step 4: iOS Photo Upload (3-4 hours)
**Goal:** Monitor Photos library and upload new images

**Tasks:**
1. Create `PhotosMonitor.swift` (iOS)
2. Implement `PHPhotoLibraryChangeObserver`
3. Add image compression + SHA-256 hashing
4. Create `UploadQueue.swift` - local queue for offline handling
5. Create `UploadStatusView.swift` - show upload progress
6. Test upload flow

**Validation:**
- New photos detected automatically
- Images compressed to 70% JPEG
- Upload succeeds via tunnel
- Server processes upload (Bull queue)
- Analysis results stored in database

### Step 5: iOS Approvals + Search (3-4 hours)
**Goal:** Display approvals and search functionality

**Tasks:**
1. Create `ApprovalsView.swift` (iOS)
2. Create `ApprovalDetailView.swift` (iOS)
3. Create `SearchView.swift` (iOS)
4. Create `IntentCardView.swift` (reusable component)
5. Test approval flow
6. Test search flow

**Validation:**
- Approvals appear in iOS app
- User can approve/reject
- Search returns relevant results
- Images display correctly

### Step 6: WebSocket/SSE Real-Time (2-3 hours)
**Goal:** Add real-time updates for approvals

**Tasks:**
1. Create `src/services/sse.ts` (server) - Server-Sent Events endpoint
2. Create `WebSocketManager.swift` (macOS)
3. Create `WebSocketManager.swift` (iOS)
4. Test real-time notifications

**Validation:**
- SSE connection established
- Approval notifications arrive immediately
- Reconnection works after disconnect

---

## Total Estimated Time

| Phase | Hours |
|-------|-------|
| Server Foundation | 4-6 |
| Mac App Refactor | 2-3 |
| iOS Foundation + Pairing | 3-4 |
| iOS Photo Upload | 3-4 |
| iOS Approvals + Search | 3-4 |
| WebSocket/SSE | 2-3 |
| Testing & Debug | 2-4 |
| **TOTAL** | **19-28 hours** |

**Realistic estimate for hackathon:** 2-3 full days of focused work

---

## Critical Dependencies

### Software (must be installed)
- ✅ Ollama (already installed)
- ✅ Node.js (already installed)
- ✅ Cloudflare tunnel (already installed)
- 🔴 Redis (need to start): `brew services start redis` or Docker

### External Services
- Browserbase API key (for Milestone I+)
- Weave API key (for Milestone G+)

### User Requirements
- iCloud Photos must be enabled
- macOS and iOS on same Apple ID

---

## Testing Strategy

### Unit Tests
- SHA-256 hashing produces correct output
- Image compression maintains quality
- Ollama service calls work

### Integration Tests
- Mac app → Server → SQLite → Analysis → Results
- iOS app → Tunnel → Server → Processing
- WebSocket notifications deliver

### End-to-End Tests
1. User screenshots flyer on iPhone
2. Image uploads to server via tunnel
3. Server analyzes with Ollama
4. Approval appears on both devices
5. User approves on iOS
6. Action executes on server
7. Success notification on both devices

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Refactor breaks existing functionality | Git branches, incremental testing |
| iOS upload fails over tunnel | Implement retry logic, offline queue |
| Ollama too slow | Bull concurrency (4 parallel), consider GPU |
| SHA-256 collisions | Statistically impossible with real photos |
| Network issues | Graceful degradation, clear error messages |
| iCloud sync delay | 5-minute timeout, show warning to user |

---

## Success Criteria

### Refactor Success
- [ ] Server analyzes images via Ollama
- [ ] Mac app uploads instead of analyzing
- [ ] No duplicate processing (dedupe works)
- [ ] Performance: 4 concurrent analyses
- [ ] Bull Board shows queue activity

### iOS Success
- [ ] Pairing via QR code works
- [ ] New photos upload automatically
- [ ] Approvals appear in real-time
- [ ] Search returns relevant results
- [ ] Offline queue handles disconnections

### Phase 4 Complete
- [ ] Both apps can upload images
- [ ] Both apps show approvals
- [ ] Real-time updates work
- [ ] Search functionality works
- [ ] End-to-end flow succeeds

---

## Next Steps

1. **Review this summary** - Make sure you understand the plan
2. **Start with REFACTOR_PLAN.md** - Follow it step by step
3. **Refer to MODELMANAGER_CHANGES.md** - When refactoring Mac app
4. **Track progress in PROGRESS.md** - Update as you complete milestones
5. **Ask questions** - If anything is unclear or you hit issues

---

## Questions for You

Before starting implementation, please confirm:

1. ✅ **Approval to proceed?** - Ready to start refactor?
2. ✅ **Redis running?** - `brew services start redis` or Docker
3. ✅ **Time availability?** - Do you have 2-3 days for this?
4. ✅ **Priority?** - Should I start implementing Phase 1 (Server Foundation) now?

Let me know if you want me to start implementing or if you have any questions!
