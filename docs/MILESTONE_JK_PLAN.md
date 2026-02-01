# Milestone J & K Implementation Plan

**Created:** Feb 1, 2026  
**Status:** Planning Complete, Ready to Build

---

## Overview

Building event extraction (Milestone J) and web search with Browserbase (Milestone K) to enable the core "Flyer → Event Discovery" workflow.

---

## Milestone J: Event Extraction from Flyers

### Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Structured Output | Ollama native JSON schema | More reliable than prompt parsing |
| Model | `qwen3-vl:8b` (existing) | Already loaded, good vision capabilities |
| Ambiguous Data | Return as-is for human review | Let approval flow handle disambiguation |
| QR Codes | Nice-to-have (deferred) | Not critical for MVP, adds dependencies |

### Event Schema

```typescript
interface ExtractedEvent {
  eventName: string;           // required
  date: string;                // required (may be ambiguous like "Next Friday")
  time?: string;               // optional (might be TBD)
  location: string;            // required
  venue?: string;              // optional (specific venue name)
  url?: string;                // optional (if visible on flyer)
  description?: string;        // optional
  ticketPrice?: string;        // optional
  confidence: number;          // 0.0-1.0
}
```

### Implementation Steps

1. **Create `src/services/event-extraction.ts`:**
   - Export `extractEventDetails(imageData: Buffer): Promise<ExtractedEvent>`
   - Use Ollama `/api/generate` with JSON schema format parameter
   - Wrap with Weave tracing (`createTracedOp`)

2. **Update `src/workers/intent-routing.ts`:**
   - When `intentType === 'event_flyer'`, call `extractEventDetails`
   - Store extracted event in SQLite `intent_documents` table
   - Queue Milestone K (web search) job

3. **SQLite Schema Update:**
   - Add `event_details` JSON column to `intent_documents` table
   - Store full extracted event object

### Testing
- **Test Case 1**: Concert flyer with clear date/time/venue
- **Test Case 2**: Meetup screenshot with ambiguous "Next Tuesday"
- **Test Case 3**: Event poster with minimal text

---

## Milestone K: Web Search for Canonical Event

### Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| SDK | Browserbase Stagehand | Native TypeScript, built for AI automation |
| Search Engine | Google | Most comprehensive results |
| Session Strategy | New session per search | Simpler for MVP, can optimize later |
| Verification | Ollama vision model comparison | Validate flyer vs browser screenshots match |
| Artifacts | Local filesystem + Weave links | Easy debugging, traceable |

### Implementation Steps

#### 1. Install Dependencies

```bash
cd photo-agent-server
npm install @browserbasehq/stagehand
```

#### 2. Create `src/services/browserbase.ts`

```typescript
import { Stagehand } from '@browserbasehq/stagehand';
import { createTracedOp } from './weave';

interface EventSearchResult {
  url: string;
  title: string;
  snippet: string;
  screenshotPath: string;
  verified: boolean;
  confidence: number;
}

// Main search function
async function searchForEvent(
  eventName: string,
  location: string,
  date: string
): Promise<EventSearchResult | null>

// Helper: Initialize Stagehand
async function createBrowserbaseSession(): Promise<Stagehand>

// Helper: Search Google
async function performGoogleSearch(
  stagehand: Stagehand,
  query: string
): Promise<string[]>

// Helper: Verify event page matches flyer
async function verifyEventMatch(
  originalImagePath: string,
  browserScreenshot: string,
  extractedEvent: ExtractedEvent
): Promise<{ verified: boolean; confidence: number }>
```

#### 3. Create Artifacts Storage

```bash
mkdir -p photo-agent-server/artifacts/screenshots
mkdir -p photo-agent-server/artifacts/recordings
```

Add to `.gitignore`:
```
artifacts/
```

#### 4. Stagehand Workflow

```typescript
// 1. Initialize session with Browserbase credentials
const stagehand = new Stagehand({
  env: 'BROWSERBASE',
  apiKey: process.env.BROWSERBASE_API_KEY,
  projectId: process.env.BROWSERBASE_PROJECT_ID,
  enableCaching: false
});

await stagehand.init();

// 2. Navigate to Google
await stagehand.page.goto('https://www.google.com');

// 3. Search for event
const searchQuery = `${eventName} ${location} ${date} event`;
await stagehand.act(`search for "${searchQuery}"`);

// 4. Extract top results
const results = await stagehand.extract(
  'extract search result links',
  z.array(z.object({
    url: z.string(),
    title: z.string(),
    snippet: z.string()
  }))
);

// 5. Visit top result
await stagehand.page.goto(results[0].url);

// 6. Take screenshot for verification
const screenshotPath = `./artifacts/screenshots/${Date.now()}.png`;
await stagehand.page.screenshot({ path: screenshotPath, fullPage: true });

// 7. Extract event details from page
const pageEventDetails = await stagehand.extract(
  'extract event details',
  z.object({
    name: z.string(),
    date: z.string(),
    time: z.string().optional(),
    location: z.string(),
    description: z.string().optional()
  })
);

// 8. Verify match using Ollama vision model
const verification = await verifyEventMatch(
  originalFlyerPath,
  screenshotPath,
  extractedEvent
);

// 9. Close session
await stagehand.close();
```

#### 5. Verification Logic

Use Ollama vision model to compare:
- Original flyer image
- Browser screenshot
- Extracted event details

```typescript
// Prompt for Ollama vision model
const verificationPrompt = `
Compare these two images and the extracted details:

Image 1: Original event flyer
Image 2: Screenshot of event webpage

Extracted Details:
- Event Name: ${eventName}
- Date: ${date}
- Location: ${location}

Do these represent the SAME event? Consider:
- Event name matches (fuzzy match OK)
- Date/time matches (format may differ)
- Location/venue matches

Respond in this format:
MATCH: [yes|no]
CONFIDENCE: [0.0-1.0]
REASONING: [one sentence]
`;
```

#### 6. Update Worker Queue

Create new Bull queue: `event-search`

```typescript
// src/workers/event-search.ts
interface EventSearchJob {
  assetId: string;
  extractedEvent: ExtractedEvent;
  flyerImagePath: string;
}

eventSearchQueue.process(async (job) => {
  const { assetId, extractedEvent, flyerImagePath } = job.data;
  
  const result = await searchForEvent(
    extractedEvent.eventName,
    extractedEvent.location,
    extractedEvent.date
  );
  
  if (result && result.verified) {
    // Update SQLite with canonical event URL
    await updateIntentDocument(assetId, {
      canonicalUrl: result.url,
      verifiedDetails: result
    });
    
    // Queue approval job (Milestone N)
    await approvalQueue.add({ assetId, eventUrl: result.url });
  } else {
    // Couldn't find or verify - queue for manual review
    await approvalQueue.add({ 
      assetId, 
      status: 'needs_manual_search',
      reason: 'Could not find matching event page'
    });
  }
});
```

#### 7. SQLite Schema Updates

```sql
-- Add columns to intent_documents table
ALTER TABLE intent_documents ADD COLUMN canonical_url TEXT;
ALTER TABLE intent_documents ADD COLUMN verified_details TEXT; -- JSON
ALTER TABLE intent_documents ADD COLUMN screenshot_path TEXT;
ALTER TABLE intent_documents ADD COLUMN verification_confidence REAL;
```

#### 8. Weave Integration

Log artifacts in Weave traces:

```typescript
// In searchForEvent function
logAttributes({
  searchQuery: query,
  topResultUrl: results[0].url,
  screenshotPath: screenshotPath,
  verificationConfidence: verification.confidence,
  sessionId: stagehand.sessionId, // Browserbase session ID
  recordingUrl: `https://browserbase.com/sessions/${stagehand.sessionId}`
});
```

---

## File Structure

```
photo-agent-server/
├── src/
│   ├── services/
│   │   ├── event-extraction.ts     ← NEW (Milestone J)
│   │   ├── browserbase.ts          ← NEW (Milestone K)
│   │   └── ollama.ts               ← UPDATE (add verification)
│   ├── workers/
│   │   ├── intent-routing.ts       ← UPDATE (call event extraction)
│   │   └── event-search.ts         ← NEW (Milestone K)
│   └── db/
│       └── sqlite.ts               ← UPDATE (schema changes)
├── artifacts/                      ← NEW (gitignored)
│   ├── screenshots/
│   └── recordings/
└── package.json                    ← UPDATE (add stagehand)
```

---

## Testing Strategy

### Milestone J Testing
1. Upload sample event flyers
2. Verify extraction accuracy for each field
3. Test ambiguous date handling
4. Validate JSON schema compliance

### Milestone K Testing
1. Test Google search with various queries
2. Verify top result navigation
3. Test screenshot capture
4. Validate Ollama verification logic
5. Test "couldn't find" edge case

### End-to-End Testing
1. Upload event flyer → Extract details → Search web → Verify match
2. Check Weave traces show full pipeline
3. Verify artifacts stored correctly
4. Test approval queue receives correct data

---

## Success Criteria

### Milestone J ✅
- [ ] Extract event name with >90% accuracy
- [ ] Extract date/time with >85% accuracy (even if ambiguous)
- [ ] Extract location with >90% accuracy
- [ ] Return structured JSON matching schema
- [ ] Full Weave tracing

### Milestone K ✅
- [ ] Successfully search Google via Stagehand
- [ ] Navigate to top 3 results if needed
- [ ] Capture screenshots for verification
- [ ] Verify match with >80% confidence
- [ ] Handle "not found" gracefully
- [ ] Artifacts stored locally and linked in Weave
- [ ] Browserbase session ID logged for Live View access

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Ollama structured output fails | Fallback to prompt parsing (like current `classifyIntent`) |
| Google blocks automated searches | Use Stagehand's stealth mode, add user-agent rotation |
| Verification false negatives | Adjust confidence threshold, allow manual override |
| Browserbase rate limits | Add retry logic with exponential backoff |
| Screenshot storage grows large | Add cleanup job for old artifacts (>7 days) |

---

## Timeline Estimate

- **Milestone J**: 2-3 hours
  - Event extraction service: 1 hour
  - Worker integration: 30 min
  - SQLite updates: 30 min
  - Testing: 1 hour

- **Milestone K**: 4-5 hours
  - Stagehand integration: 1.5 hours
  - Google search workflow: 1 hour
  - Verification logic: 1 hour
  - Worker queue setup: 1 hour
  - Testing: 1.5 hours

**Total: 6-8 hours** for both milestones

---

## Next Steps

1. Start with Milestone J (event extraction)
2. Test thoroughly with sample flyers
3. Move to Milestone K (web search)
4. End-to-end integration testing
5. Update documentation with results

Let's build! 🚀
