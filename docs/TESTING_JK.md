# Testing Milestones J & K

## Prerequisites
- Ollama running with `qwen3-vl:8b` model loaded
- Redis running (`brew services start redis` or Docker)
- Browserbase API key and Project ID configured in `.env`
- Node server and workers running

## Test Setup

1. **Start the server and workers:**
```bash
cd photo-agent-server
npm run dev
```

2. **Monitor queues:**
Open http://localhost:3001/admin/queues in your browser

3. **Watch Weave traces:**
Check https://wandb.ai/weave for live traces

## Test Cases

### Test 1: Event Extraction (Milestone J)

**Goal:** Verify that event details are correctly extracted from a flyer image

**Steps:**
1. Upload a sample event flyer via the macOS or iOS app
2. Check Bull Board - job should flow through:
   - `image-upload` → `image-analysis` → `intent-routing`
3. Check server logs for extraction output:
   ```
   🎟️  Extracting event details from asset...
   ✅ Extracted event: "Event Name" on Date in Location
   ```
4. Query SQLite to verify `eventDetails` is populated:
   ```bash
   sqlite3 photo-agent-server/data/photos.db
   SELECT id, eventDetails FROM assets WHERE eventDetails IS NOT NULL;
   ```

**Expected Output:**
```json
{
  "eventName": "SF Tech Meetup",
  "date": "March 15, 2024",
  "time": "7:00 PM",
  "location": "San Francisco",
  "venue": "The Fillmore",
  "confidence": 0.92
}
```

**Success Criteria:**
- ✅ Event name extracted correctly
- ✅ Date extracted (even if ambiguous like "Next Friday")
- ✅ Location extracted
- ✅ Optional fields (time, venue, url) extracted when present
- ✅ Confidence score between 0.0-1.0
- ✅ JSON schema matches `ExtractedEvent` interface

### Test 2: Web Search & Verification (Milestone K)

**Goal:** Verify that Browserbase Stagehand can find and verify the canonical event page

**Steps:**
1. After Test 1 completes, check Bull Board for `event-search` queue
2. Job should start processing automatically
3. Monitor server logs for Browserbase activity:
   ```
   🌐 Initializing Browserbase session...
   ✅ Browserbase session started: <session-id>
   🔍 Searching for: "SF Tech Meetup San Francisco March 15 event"
   ✅ Found 5 search results
   🌐 Checking result 1: ...
   📸 Screenshot saved: event_<timestamp>_result1.png
   🔍 Verifying event match...
   ✅ Verification: MATCH (confidence: 0.85)
   🎉 Found matching event: SF Tech Meetup
   ```
4. Check Browserbase console for session recording:
   - https://www.browserbase.com/sessions/<session-id>
5. Check `artifacts/screenshots/` for captured images
6. Check SQLite for `canonicalUrl` and `verifiedDetails`:
   ```sql
   SELECT canonicalUrl, verificationConfidence, screenshotPath 
   FROM assets 
   WHERE canonicalUrl IS NOT NULL;
   ```

**Expected Output:**
- Screenshot file: `artifacts/screenshots/event_<timestamp>_result1.png`
- Database updated with:
  ```
  canonicalUrl: "https://www.eventbrite.com/e/sf-tech-meetup-..."
  verificationConfidence: 0.85
  screenshotPath: "artifacts/screenshots/event_<timestamp>_result1.png"
  ```
- Approval created in `approvals` table with status='pending'

**Success Criteria:**
- ✅ Browserbase session created successfully
- ✅ Google search performed via Stagehand
- ✅ Top 3 results visited
- ✅ Screenshots captured for each result
- ✅ Verification compares flyer to webpage
- ✅ Match confidence >= 0.7 triggers success
- ✅ Session recording available in Browserbase
- ✅ Approval created with all event details

### Test 3: No Match Found (Edge Case)

**Goal:** Verify graceful handling when no matching event page is found

**Steps:**
1. Upload a flyer for a very local/obscure event unlikely to be online
2. Watch worker logs for "Could not find matching event page"
3. Check that approval is still created with `needsManualSearch: true`

**Expected Behavior:**
- ✅ Searches top 3 results
- ✅ Verification fails for all results (confidence < 0.7)
- ✅ Approval created with action: 'manual_search'
- ✅ Suggested query provided for manual review

### Test 4: End-to-End Flow

**Goal:** Verify complete pipeline from upload to approval

**Steps:**
1. Upload event flyer
2. Wait for all queues to process
3. Check final state:
   - Asset has `eventDetails` populated
   - Asset has `canonicalUrl` (if found)
   - Approval exists in `pending` state
   - Screenshots stored in `artifacts/`

**Weave Trace Verification:**
1. Open Weave dashboard
2. Find the trace for your uploaded asset
3. Verify spans exist for:
   - `analyzeImage`
   - `classifyIntent`
   - `extractEventDetails`
   - `searchForEvent` (with nested verification)
4. Check that artifacts are linked in trace metadata

## Manual Testing Checklist

### Milestone J: Event Extraction
- [ ] Concert flyer → extracts name, date, venue
- [ ] Meetup screenshot → extracts details correctly
- [ ] Event with ambiguous date ("Next Friday") → returns as-is
- [ ] Event with missing time → omits time field
- [ ] Event with URL visible → extracts URL
- [ ] Non-event image → returns `isEventFlyer: false`
- [ ] Flyer with poor image quality → handles gracefully

### Milestone K: Web Search
- [ ] Popular event (Eventbrite) → finds correct page
- [ ] Local meetup (Meetup.com) → finds correct page
- [ ] Event with common name → verifies with location/date
- [ ] Obscure event → creates manual search approval
- [ ] Verification correctly identifies match
- [ ] Verification correctly identifies mismatch
- [ ] Screenshots captured for all checked results
- [ ] Browserbase session recording available
- [ ] Session cleanup happens after completion

## Debugging

### If extraction fails:
```bash
# Check Ollama is running
ollama list | grep qwen3-vl

# Test Ollama directly
curl http://localhost:11434/api/generate -d '{
  "model": "qwen3-vl:8b",
  "prompt": "test",
  "format": "json"
}'
```

### If Browserbase fails:
```bash
# Check environment variables
echo $BROWSERBASE_API_KEY
echo $BROWSERBASE_PROJECT_ID

# Check Stagehand installation
npm list @browserbasehq/stagehand
```

### If verification is too strict/lenient:
- Adjust confidence threshold in `event-search.ts` (currently 0.7)
- Modify verification prompt in `browserbase.ts` for more/less leniency

## Performance Benchmarks

Expected timing:
- Event extraction: 5-15 seconds (Ollama vision model)
- Web search (full): 30-60 seconds (Google search + 3 page visits + verification)
- Total pipeline: ~45-75 seconds from upload to approval

## Next Steps After Testing

Once both milestones are validated:
1. Move to Milestone M (Calendar Integration)
2. Build Milestone N (macOS Approvals UI)
3. Polish with Milestone S & T (Demo dashboard + Live View)

## Known Limitations

- QR code detection: Not implemented (nice-to-have)
- Multi-day events: Returns first date only
- Time zones: Extracted as-is, not converted
- Session persistence: New session per search (HITL pause not implemented yet)
- Rate limiting: No retry logic for Browserbase API errors
