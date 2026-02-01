# Pre-Implementation Checklist

**Date:** Feb 1, 2026  
**Purpose:** Quick checklist before starting Phase 4 implementation

---

## ✅ Planning Complete

- [x] Architecture decisions made (all questions answered)
- [x] PRD updated with new architecture
- [x] PROGRESS.md updated with Phase 4 milestones
- [x] REFACTOR_PLAN.md created (step-by-step guide)
- [x] MODELMANAGER_CHANGES.md created (Mac app changes)
- [x] PHASE4_SUMMARY.md created (executive summary)
- [x] ARCHITECTURE_DIAGRAMS.md created (visual explanation)
- [x] User concerns addressed (no objections to approach)

---

## 🔧 Environment Setup

### Required Software
- [ ] Redis installed and running: `brew services start redis`
- [ ] Ollama installed: `brew install ollama`
- [ ] Ollama running: `brew services status ollama` (should show "started")
- [ ] Node server dependencies current: `cd photo-agent-server && npm install`

**Note:** Redis must be running as a system service. Workers run via npm scripts.

### Verify Current Setup
```bash
# Check Redis
brew services list | grep redis
# Should show: redis started

# Check Ollama
curl http://localhost:11434/api/tags
# Should return: list of models including qwen3-vl:8b

# Check Node server (starts server + workers)
cd photo-agent-server
npm run dev
# Should show:
# [server] 🚀 Server running on http://localhost:1738
# [workers] ✅ Image upload worker started
# [workers] ✅ Image analysis worker started
# [server] ✅ Bull queues connected to Redis

# Check macOS app
# Open in Xcode, run - should show Status Dashboard
```

---

## 📁 Git Branch Strategy

### Recommended Approach
```bash
# Create refactor branch
git checkout -b refactor/milestone-d-e-centralized-analysis

# Create Phase 4 branch (based on refactor)
git checkout -b feature/phase4-ios-macos-support

# Work in feature branch
# Merge back to refactor when Phase 4 complete
# Merge refactor to main when fully tested
```

### Why?
- Isolates refactor changes
- Easy rollback if needed
- Can continue other work on main

---

## 📋 Implementation Order

### Week 1: Server Foundation + Mac Refactor
- [ ] Day 1-2: Server foundation (Milestone E)
  - [ ] SQLite setup
  - [ ] Bull queues
  - [ ] Ollama service
  - [ ] Upload endpoint
  - [ ] Workers
- [ ] Day 3: Mac app refactor
  - [ ] Image upload
  - [ ] SHA-256 hashing
  - [ ] ModelManager simplification
  - [ ] UI updates

### Week 2: iOS Implementation
- [ ] Day 4: iOS foundation
  - [ ] Shared package
  - [ ] Pairing flow
  - [ ] Connection management
- [ ] Day 5-6: iOS photo upload
  - [ ] PhotosMonitor
  - [ ] Upload queue
  - [ ] Offline handling
- [ ] Day 7: iOS UI
  - [ ] Approvals view
  - [ ] Search view
  - [ ] WebSocket/SSE

### Week 3: Testing + Polish
- [ ] Day 8-9: Integration testing
- [ ] Day 10: Bug fixes + documentation

---

## 🧪 Testing Strategy

### After Each Phase
1. **Server Foundation**
   - [ ] Server starts without errors
   - [ ] Bull Board accessible
   - [ ] SQLite database created
   - [ ] Upload endpoint accepts data
   - [ ] Workers process jobs
   - [ ] Ollama analysis completes

2. **Mac App Refactor**
   - [ ] Images upload successfully
   - [ ] SHA-256 computed correctly
   - [ ] Jobs appear in Bull Board
   - [ ] Analysis results in database
   - [ ] UI shows queue stats
   - [ ] No regressions in existing features

3. **iOS Foundation**
   - [ ] QR code scans correctly
   - [ ] Tunnel endpoint saved
   - [ ] Connection health check works
   - [ ] Shared package imports correctly

4. **iOS Photo Upload**
   - [ ] New photos detected
   - [ ] Images compressed correctly
   - [ ] Upload succeeds via tunnel
   - [ ] Offline queue works
   - [ ] Jobs processed on server

5. **iOS UI**
   - [ ] Approvals display
   - [ ] Approve/reject works
   - [ ] Search returns results
   - [ ] Real-time updates work

---

## 📚 Reference Documents (Read in Order)

1. **Start here:** `docs/PHASE4_SUMMARY.md`
   - Executive summary of entire plan
   - High-level overview
   - Estimated timelines

2. **Architecture:** `docs/ARCHITECTURE_DIAGRAMS.md`
   - Visual explanation of changes
   - Data flow diagrams
   - Component responsibilities

3. **Server implementation:** `docs/REFACTOR_PLAN.md`
   - Step-by-step server refactor
   - Code examples
   - Testing checklist

4. **Mac implementation:** `docs/MODELMANAGER_CHANGES.md`
   - Specific changes to ModelManager.swift
   - PhotosManager updates
   - UI changes

5. **Progress tracking:** `docs/PROGRESS.md`
   - Update as you complete milestones
   - Detailed milestone breakdowns

6. **Product requirements:** `docs/PRD.md`
   - Reference for product decisions
   - Updated with new architecture

---

## ⚠️ Common Pitfalls to Avoid

### 1. Image Compression Quality
- ❌ Don't use too low quality (<50%)
- ✅ Use 70% JPEG (good balance)
- ✅ Test OCR still works after compression

### 2. SHA-256 Hashing
- ❌ Don't hash compressed image
- ✅ Hash original image data
- ✅ Store original hash, then compress

### 3. Bull Queue Configuration
- ❌ Don't set concurrency too high
- ✅ Start with 4 concurrent (Ollama limit)
- ✅ Monitor CPU usage

### 4. Tunnel Reliability
- ❌ Don't assume tunnel always available
- ✅ Implement offline queue
- ✅ Retry with exponential backoff
- ✅ Show connection status in UI

### 5. iCloud Photos Sync
- ❌ Don't expect instant sync
- ✅ Allow 5-minute timeout
- ✅ Show warning if photo not found

### 6. Keychain Storage (iOS)
- ❌ Don't store tunnel URL in UserDefaults
- ✅ Use Keychain for secure storage
- ✅ Handle Keychain errors gracefully

---

## 🚨 Rollback Plan

If something goes wrong:

### Server Issues
```bash
# Revert to previous version
git checkout main
cd photo-agent-server
npm install
npm run dev
```

### Mac App Issues
```bash
# Revert ModelManager.swift
git checkout main -- photo-agent-macos/Managers/ModelManager.swift

# Clean build
Product > Clean Build Folder
```

### Database Issues
```bash
# Delete database (will be recreated)
rm photo-agent-server/data/photos.db

# Restart server
npm run dev
```

### Redis Issues
```bash
# Check if Redis is running
brew services list | grep redis

# Start Redis
brew services start redis

# Check Redis connection
redis-cli ping
# Should return: PONG

# View queue data
redis-cli
> KEYS bull:*
> LLEN bull:image-upload:wait

# Flush all queues (reset)
redis-cli FLUSHALL

# Or use Docker
docker run -d --name redis -p 6379:6379 redis:7-alpine
```

---

## ✅ Final Pre-Flight Check

Before writing any code:

- [ ] I understand the architecture changes
- [ ] I've read REFACTOR_PLAN.md
- [ ] I've read MODELMANAGER_CHANGES.md
- [ ] I have Redis installed and running (`brew services start redis`)
- [ ] I have Ollama installed and running
- [ ] I have a git branch for this work
- [ ] I have a backup of current working code
- [ ] I have 2-3 days available for focused work
- [ ] I'm ready to start with Phase 1 (Server Foundation)

**Note:** Redis must be running separately. Workers run via npm scripts (`npm run dev`).

---

## 🎯 Success Metrics

You'll know you're done when:

### Refactor Complete
- [ ] Mac app uploads images to server
- [ ] Server analyzes via Ollama
- [ ] Results stored in SQLite
- [ ] Bull Board shows queue activity
- [ ] No duplicate processing

### iOS Complete
- [ ] iOS app pairs with macOS
- [ ] New photos upload automatically
- [ ] Approvals appear on both devices
- [ ] Search returns relevant results
- [ ] Real-time updates work

### Phase 4 Complete
- [ ] End-to-end flow works: Screenshot → Analysis → Approval → Action
- [ ] Both apps work independently
- [ ] Offline handling works
- [ ] All tests pass
- [ ] Documentation updated

---

## 🚀 Ready to Start?

If all checklists above are complete, you're ready to begin!

**First step:** Open `docs/REFACTOR_PLAN.md` and start with Phase 1, Step 1.1 (Install Dependencies).

Good luck! 🎉
