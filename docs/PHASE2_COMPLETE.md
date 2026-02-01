# Phase 2 Complete: Weave Observability + Intent Pipeline

**Date:** Feb 1, 2026  
**Status:** ✅ Complete  
**Milestones:** G (Weave Observability) + H (Intent Pipeline)

---

## Summary

Phase 2 is now complete! We've successfully integrated Weave observability for full tracing of all agent operations and implemented an automated intent classification pipeline. Every photo uploaded to the system is now automatically analyzed, classified by intent type, and routed appropriately.

---

## What Was Built

### Milestone G: Weave Observability ✅

**Key Features:**
- Full end-to-end tracing of all operations
- Automatic tracing of Ollama LLM calls
- Custom attributes logged for debugging and analysis
- Graceful degradation if Weave API key not configured

**Files Created:**
- `photo-agent-server/src/services/weave.ts` - Weave client + helper functions

**Files Updated:**
- `photo-agent-server/src/index.ts` - Initialize Weave on server startup
- `photo-agent-server/src/workers/index.ts` - Initialize Weave for workers
- `photo-agent-server/src/workers/image-upload.ts` - Added trace attributes
- `photo-agent-server/src/workers/image-analysis.ts` - Added trace attributes
- `photo-agent-server/src/services/ollama.ts` - Wrapped with Weave tracing

**Traces Captured:**
Every operation now generates Weave traces with rich context:
- **Image Upload**: contentHash, deviceId, mediaType, hasLocation
- **Image Analysis**: model name, image size, summary/OCR lengths, embedding dimension
- **Intent Classification**: intent type, confidence score, reasoning
- **Intent Routing**: routing decision, Browserbase readiness

### Milestone H: Photo → Intent Pipeline ✅

**Key Features:**
- Automatic intent classification using Ollama
- Three intent types: `event_flyer`, `general_photo`, `other`
- Confidence-based routing for automated actions
- Full integration with existing image analysis pipeline

**Files Created:**
- `photo-agent-server/src/workers/intent-routing.ts` - Intent classification worker

**Files Updated:**
- `photo-agent-server/src/services/ollama.ts` - Added `classifyIntent()` function

**Intent Classification:**
```typescript
{
  intentType: 'event_flyer' | 'general_photo' | 'other',
  confidence: 0.0-1.0,
  reasoning: 'One sentence explanation'
}
```

**Routing Logic:**
- `event_flyer` + confidence ≥ 0.7 → **Marked ready for Browserbase (Phase 3)**
- All other classifications → Stored for search/manual review

---

## Complete Processing Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│ macOS/iOS App                                               │
│  • Extract photo metadata                                   │
│  • Compress image (70% JPEG)                               │
│  • Compute SHA-256 hash                                    │
│  • POST /api/assets/upload                                 │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ Queue: image-upload [TRACED]                                │
│  • Check if contentHash exists (deduplication)             │
│  • Store in SQLite                                         │
│  • Enqueue for analysis                                    │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ Queue: image-analysis (4 concurrent) [TRACED]               │
│  • Fetch image from SQLite                                 │
│  • Ollama: Generate summary + OCR text                     │
│  • Ollama: Generate embedding                              │
│  • Update SQLite with results                              │
│  • Enqueue for intent routing                              │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ Queue: intent-routing (2 concurrent) [TRACED] [NEW]         │
│  • Fetch summary + OCR from SQLite                         │
│  • Ollama: Classify intent type                            │
│  • Update SQLite with intentLabels + confidence            │
│  • Route based on classification:                          │
│    - event_flyer (conf ≥ 0.7) → Ready for Browserbase     │
│    - other types → Available for search                    │
└─────────────────────────────────────────────────────────────┘
```

---

## Intent Types Explained

### 1. event_flyer
**What it detects:**
- Event posters and flyers
- Party invitations
- Concert announcements
- Meetup/conference posters
- Eventbrite/Luma screenshots

**Key indicators:**
- Event names/titles
- Dates and times
- Venue/location information
- RSVP links or QR codes
- Ticket information

**Routing:**
- If confidence ≥ 0.7 → **Marked ready for Phase 3 (Browserbase processing)**
- Will be used for canonical event search, RSVP, and calendar integration

### 2. general_photo
**What it detects:**
- Personal photos of people, places, nature
- Screenshots of non-event content
- Product photos
- Scenic views
- Portraits or group photos

**Routing:**
- Stored for search and manual review
- No automated actions

### 3. other
**What it detects:**
- Receipts
- Documents
- Screenshots of articles or social media
- Memes or graphics
- Abstract images

**Routing:**
- Stored for search and manual review
- No automated actions

---

## Configuration

### Environment Variables
Add to `photo-agent-server/.env`:
```bash
# Weave Observability
WEAVE_API_KEY=your_api_key_here
```

### Weave Project
- **Project Name**: `photo-agent` (hardcoded)
- **View Traces**: https://wandb.ai/weave

### Confidence Threshold
- **Current**: 0.7 (70% confidence required for event flyer routing)
- **Configurable**: Edit `photo-agent-server/src/workers/intent-routing.ts` line 30

---

## Testing

### 1. Verify Server Compilation
```bash
cd photo-agent-server
npm run type-check
```
Expected: ✅ No errors

### 2. Start Server + Workers
```bash
cd photo-agent-server
npm run dev
```
Expected output:
- ✅ SQLite database initialized
- ✅ Bull queue service initialized
- ⚠️  WEAVE_API_KEY not found (if not configured)
- ✅ Image upload worker started
- ✅ Image analysis worker started (concurrency: 4)
- ✅ Intent routing worker started (concurrency: 2)
- ✅ All workers started
- 🚀 Server running on http://localhost:1738
- 📊 Bull Board available at http://localhost:1738/admin/queues

### 3. Upload a Test Photo
From macOS app:
1. Open the app
2. Start the server
3. Scan photos from library
4. Watch the Bull Board UI for job progress

### 4. View Traces in Weave
1. Go to https://wandb.ai/weave
2. Navigate to project "photo-agent"
3. View traces for uploaded photos
4. Inspect attributes logged at each stage

---

## Debugging

### Check Queue Status
Visit: http://localhost:1738/admin/queues

### Check Database
```bash
cd photo-agent-server
sqlite3 data/photos.db
sqlite> SELECT id, filename, intentLabels, confidence FROM assets LIMIT 10;
```

### Check Weave Traces
1. Visit wandb.ai/weave
2. Filter by operation: `analyzeImage`, `classifyIntent`
3. Inspect attributes and timing

### Common Issues

**Issue**: Weave tracing not working
- **Solution**: Set `WEAVE_API_KEY` in `.env` file

**Issue**: Intent classification always returns "other"
- **Solution**: Check Ollama is running: `curl http://localhost:11434/api/tags`
- Ensure `qwen3-vl:8b` model is installed: `ollama pull qwen3-vl:8b`

**Issue**: Workers not processing jobs
- **Solution**: Check Redis is running: `brew services list | grep redis`
- Start Redis: `brew services start redis`

---

## Next Steps: Phase 3

With Phase 2 complete, we're ready to move to Phase 3: Skills & Actions (Web Automation)

**Upcoming Milestones:**
- **Milestone I**: Browserbase integration
- **Milestone J**: Flyer detection + event extraction (web enrichment)
- **Milestone K**: Web search for canonical event
- **Milestone L**: RSVP form completion
- **Milestone M**: Calendar integration

**What happens to event_flyer photos:**
- Currently marked as "ready for Browserbase"
- Phase 3 will pick these up and:
  1. Search web for canonical event page
  2. Extract structured event details
  3. Create approval for user
  4. On approval: Complete RSVP + add to calendar

---

## Files Changed

### New Files
- `photo-agent-server/src/services/weave.ts`
- `photo-agent-server/src/workers/intent-routing.ts`

### Modified Files
- `photo-agent-server/src/services/ollama.ts`
- `photo-agent-server/src/workers/index.ts`
- `photo-agent-server/src/workers/image-upload.ts`
- `photo-agent-server/src/workers/image-analysis.ts`
- `photo-agent-server/src/index.ts`
- `photo-agent-server/package.json`
- `docs/PROGRESS.md`
- `docs/CHANGELOG.md`

---

## Success Metrics (Now Measurable via Weave!)

With Weave tracing, we can now measure:
- ✅ **Intent classification accuracy**: View confidence scores across all photos
- ✅ **Processing pipeline performance**: Timing for each stage
- ✅ **Event flyer detection rate**: % of photos classified as event_flyer
- ✅ **Queue throughput**: Jobs processed per minute
- ✅ **Error rates**: Failed jobs and reasons

---

## Conclusion

Phase 2 is complete! We now have:
1. ✅ **Full observability** via Weave tracing
2. ✅ **Automated intent classification** for all photos
3. ✅ **Smart routing** for event flyers to Phase 3
4. ✅ **Confidence-based automation** (only high-confidence events proceed)
5. ✅ **Complete processing pipeline** from upload → analysis → classification → routing

The foundation is set for Phase 3: Web automation with Browserbase!
