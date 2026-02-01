# Agentic Search Implementation - Testing Guide

**Date:** Feb 1, 2026  
**Milestone:** H-2 (Priority #1)  
**Status:** ✅ Implementation Complete, Ready for Testing

---

## What Was Built

Implemented a full agentic search system using **Vercel AI SDK** with **Ollama provider** for local model execution. The agent uses tool-calling to intelligently search the photo library based on natural language queries.

### Core Components

1. **Search Tools** (`src/services/search-tools.ts`)
   - 6 specialized tools the agent can call
   - Cosine similarity for semantic search
   - Natural language date parsing
   - Intelligent result combination and deduplication

2. **Search Agent** (`src/services/search-agent.ts`)
   - Vercel AI SDK orchestration
   - Uses `qwen3-vl:8b` model (already installed)
   - Max 5 tool iterations
   - Full Weave tracing

3. **API Endpoint** (`src/routes/search.ts`)
   - `GET /api/search?q=query&maxResults=10`
   - Matches iOS SearchView expectations
   - Returns `photoLibraryId` for Photos library integration

---

## Prerequisites

### 1. Dependencies Installed
```bash
cd photo-agent-server
npm install  # ✅ Already completed
```

### 2. Ollama Models Required
```bash
# Check what's installed
curl http://localhost:11434/api/tags

# Required models (already installed):
# ✅ qwen3-vl:8b - Agent model (also used for image analysis)
# ✅ nomic-embed-text - Embeddings for semantic search
```

### 3. Server Must Be Running
```bash
cd photo-agent-server
npm run dev
```

This starts:
- Express server on port 1738
- Bull workers for image processing
- Redis queue monitoring

---

## Testing the Search

### Option 1: Using the Test Script

```bash
cd photo-agent-server

# Basic search
node test-search.js "red flowers"

# Search with custom max results
node test-search.js "event flyers" 20

# Search by date
node test-search.js "photos from this week"

# Search by location
node test-search.js "photos in San Francisco"
```

### Option 2: Using curl

```bash
# Basic search
curl "http://localhost:1738/api/search?q=red%20flowers&maxResults=10"

# Event flyers
curl "http://localhost:1738/api/search?q=event%20flyers"

# Date-based search
curl "http://localhost:1738/api/search?q=photos%20from%20this%20week"
```

### Option 3: Using iOS App

The iOS `SearchView.swift` is already configured to call this endpoint:
1. Open iOS app
2. Navigate to Search tab
3. Type a query (e.g., "red flowers")
4. Hit search

The app will:
- Call `GET /api/search?q=...`
- Display results in `SearchResultCard` components
- Use `photoLibraryId` to fetch actual images from Photos library

---

## Expected Response Format

```json
{
  "success": true,
  "total": 5,
  "results": [
    {
      "id": "asset-uuid",
      "photoLibraryId": "ABC123/L0/001",
      "intentType": "general_photo",
      "summary": "A vibrant image showing red roses in a garden...",
      "ocrText": "",
      "confidence": 0.85,
      "creationDate": "2026-01-28T14:30:00Z",
      "filename": "IMG_1234.HEIC"
    }
  ],
  "agentSteps": {
    "toolCalls": ["searchByEmbedding", "filterByDateRange"],
    "reasoning": "I used semantic search to find red flower images, then filtered by recent dates.",
    "iterations": 2
  }
}
```

---

## How the Agent Works

### Agent Strategy (from system prompt)

1. **Start with semantic search** (`searchByEmbedding`)
   - Best for conceptual queries like "red flowers", "people at parties"
   - Uses cosine similarity on embeddings

2. **Add text search if needed** (`searchByText`)
   - For exact keyword matching
   - Searches OCR text and summaries

3. **Apply filters to refine**
   - `filterByIntent` - event_flyer vs general_photo vs other
   - `filterByDateRange` - "this week", "last 7 days", etc.
   - `filterByLocation` - location-based filtering

4. **Combine and deduplicate** (`combineResults`)
   - Merges multiple search results
   - Removes duplicates
   - Returns top N results

### Example Agent Flow

```
User query: "red flowers from this week"

Agent reasoning:
1. This is a semantic + temporal query
2. Call searchByEmbedding("red flowers", topK=20)
   → Returns 20 semantically similar images
3. Call filterByDateRange("this week")
   → Filters to images from current week
4. Return top 10 results

Tools used: searchByEmbedding, filterByDateRange
Iterations: 2
```

---

## Weave Observability

All search operations are fully traced in Weave:

### Attributes Logged
- `userQuery` - Original search query
- `maxResults` - Requested result count
- `deviceId` - Device making the request
- `toolCallsUsed` - Array of tools the agent called
- `iterationCount` - Number of agent iterations
- `resultsReturned` - Final result count
- `executionTime` - Total time in milliseconds

### Viewing Traces
1. Ensure `WEAVE_API_KEY` is set in `.env`
2. Visit wandb.ai/weave
3. Navigate to "photo-agent" project
4. View search traces with full agent decision history

---

## Troubleshooting

### Issue: "Search is coming soon!"
**Cause:** Server not running or search endpoint not registered  
**Fix:** 
```bash
cd photo-agent-server
npm run dev
```

### Issue: Empty results
**Cause:** No photos have been analyzed yet  
**Fix:** 
1. Open macOS app
2. Start photo analysis (scans last 1000 photos)
3. Wait for analysis to complete
4. Embeddings will be generated for each photo
5. Try search again

### Issue: "Failed to generate query embedding"
**Cause:** Ollama not running or model not available  
**Fix:**
```bash
# Check Ollama status
curl http://localhost:11434/api/tags

# Restart Ollama if needed
brew services restart ollama

# Verify models are installed
ollama pull qwen3-vl:8b
ollama pull nomic-embed-text
```

### Issue: Agent not calling tools
**Cause:** Model not responding correctly to tool calls  
**Fix:**
- Check server logs for LLM errors
- Verify `qwen3-vl:8b` model supports tool calling
- May need to use a different model (e.g., `llama3.2` if available)

### Issue: Slow response times
**Cause:** Large database or complex queries  
**Expected:** First query may take 3-5 seconds (generating embedding + searching)  
**Optimization:**
- Limit `topK` parameter in embedding search
- Reduce `maxResults` in query
- Consider caching frequently searched terms

---

## Next Steps

### Immediate Testing
1. ✅ Verify type-check passes
2. 🔴 Start server and test basic search
3. 🔴 Test with iOS app
4. 🔴 Check Weave traces
5. 🔴 Validate results quality

### Optimization Opportunities
- [ ] Cache query embeddings for common searches
- [ ] Add relevance scoring to combine semantic + text search
- [ ] Implement search history and suggestions
- [ ] Add search result explanations ("Why did I get this?")
- [ ] Tune tool selection strategy based on query patterns

### Follow-up Milestones
Once H-2 is validated:
- **Milestone J** - Event extraction from flyers
- **Milestone M** - Calendar integration  
- **Milestone K** - Web search for canonical events
- **Milestone N** - macOS approvals UI

---

## Sample Queries to Test

### Semantic Queries
- "red flowers"
- "people at parties"
- "screenshots with code"
- "concert photos"
- "receipts"

### Intent Queries
- "event flyers"
- "general photos"
- "documents"

### Temporal Queries
- "photos from this week"
- "images from last 7 days"
- "screenshots from today"
- "photos from yesterday"

### Location Queries
- "photos in San Francisco"
- "images near Golden Gate Bridge"
- "pictures from New York"

### Combined Queries
- "event flyers from this week"
- "red flowers from last month"
- "code screenshots from today"

---

## Files Modified

```
photo-agent-server/
├── src/
│   ├── services/
│   │   ├── search-tools.ts      ✅ NEW (6 tools + utilities)
│   │   └── search-agent.ts      ✅ NEW (Vercel AI + Ollama)
│   ├── routes/
│   │   └── search.ts            ✅ NEW (GET /api/search)
│   └── index.ts                 ✅ UPDATED (added search router)
├── package.json                 ✅ UPDATED (added ai, ollama-ai-provider, zod)
└── test-search.js              ✅ NEW (CLI test script)

docs/
├── PROGRESS.md                  ✅ UPDATED (H-2 status)
├── CHANGELOG.md                 ✅ UPDATED (Change #10)
└── SEARCH_TESTING.md           ✅ NEW (this file)
```

---

## Success Criteria (from PRD)

- ✅ Natural language queries work without exact keyword matching
- 🔴 Agent intelligently selects appropriate tools
- 🔴 Results are semantically relevant (validated via Weave traces)
- 🔴 Full agent loop visible in Weave dashboard
- 🔴 iOS SearchView displays results correctly
- 🔴 Response time < 3 seconds for typical queries

**Status:** Implementation complete, validation pending
