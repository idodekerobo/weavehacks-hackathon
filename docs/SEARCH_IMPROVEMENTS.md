# Search Improvements Summary

**Date:** Feb 1, 2026  
**Changes:** Enhanced logging, timeout handling, Weave tracing, and streaming support

---

## What Was Changed

### 1. Enhanced Logging (`search-agent.ts`)

Added detailed logging throughout the search pipeline:

```typescript
console.log('   📤 Sending request to Ollama...');
console.log('   ✅ Ollama responded in 2341ms');
console.log('   📊 Response steps: 3');
console.log('   📊 Tool calls: 2');
console.log('   🔧 Tool call 1: searchByEmbedding with args: {"query":"sneakers","topK":20}');
console.log('   📦 Got 15 results from embedding');
console.log('   🔀 Deduplicating 15 total results...');
console.log('   ✅ 15 unique results after deduplication');
console.log('   ⏱️  Total time: 2567ms');
```

**Benefits:**
- See exactly where the agent is stuck
- Monitor Ollama response times
- Track which tools are being called
- Understand result flow through pipeline

### 2. Timeout Protection (`search.ts`)

Added 25-second timeout (before iOS 30s timeout):

```typescript
const SEARCH_TIMEOUT_MS = 25000;

const response = await Promise.race([
  agentSearch({ query, deviceId, maxResults }),
  timeoutPromise
]);
```

**Benefits:**
- iOS app gets proper error response instead of hanging
- Returns HTTP 504 with helpful error message
- Server logs show execution time at timeout
- Prevents zombie requests

### 3. Improved Weave Tracing (`weave.ts`)

Enhanced observability with better attributes:

```typescript
logAttributes({
  userQuery: query,
  model: AGENT_MODEL,
  toolCallsUsed: ['searchByEmbedding', 'filterByDateRange'],
  iterationCount: 2,
  resultsReturned: 10,
  executionTime: 2567,
  ollamaResponseTime: 2341,
  agentReasoning: "I used semantic search to find...",
  success: true
});
```

**Benefits:**
- Track performance metrics in Weave dashboard
- Debug failed searches with full context
- Compare different query patterns
- Monitor model performance over time

### 4. Streaming Support (NEW: `search-agent-streaming.ts`)

Added streaming endpoint for progressive updates:

**Endpoint:** `GET /api/search/stream`

**Stream Events:**
```json
{"type":"status","message":"Agent started processing...","timestamp":123}
{"type":"tool-call","toolName":"searchByEmbedding","args":{...},"timestamp":456}
{"type":"partial-results","count":15,"total":15,"timestamp":789}
{"type":"complete","results":[...],"total":10,"executionTime":2567}
```

**Benefits:**
- iOS app can show real-time progress
- Users see activity instead of blank loading screen
- Can display tool names: "Searching by similarity..."
- Better UX for slow searches

---

## Qwen3-VL Tool Calling Support

### Does it support tool calling?

**Yes, but with caveats:**

According to the [Ollama model card](https://ollama.com/library/qwen3-vl:8b), Qwen3-VL has **"Visual Agent Capabilities"** and can "call tools" for GUI automation tasks.

**However:** The model is optimized for:
- Visual tool calling (clicking buttons, recognizing UI elements)
- Operating computer/mobile interfaces
- Visual grounding tasks

**Current Issue:** We're using it for **text-only** tool calling (search functions), which may not be its strength. The model might be:
- Slower to respond than text-only models
- Less reliable with function calling format
- Confused by complex tool schemas

### Recommended Alternative Models

For better tool calling performance, consider:

1. **Llama 3.1 / 3.2** - Built-in function calling support
2. **Mistral / Mixtral** - Excellent tool calling capabilities
3. **Qwen2.5** (text-only) - Same family, optimized for text tasks

To switch models, just change line 14 in `search-agent.ts`:
```typescript
const AGENT_MODEL = 'llama3.1:8b'; // or 'mistral', 'qwen2.5', etc.
```

---

## Streaming vs. Non-Streaming

### Current Non-Streaming Flow

```
iOS → Server → Agent starts → [wait 20s] → Agent completes → Results → iOS
                ↑___________________silent period____________________↑
```

**Problem:** iOS shows blank loading screen for 20+ seconds with no feedback.

### Streaming Flow

```
iOS → Server → Stream opens → [status] → [tool-call] → [partial-results] → [complete]
                    ↓            ↓            ↓              ↓                ↓
                iOS UI      "Starting"   "Searching"    "Found 15"    Show results
```

**Benefits:**
- iOS can show progress: "Searching by similarity..."
- Users see tool names as they execute
- Partial result counts: "Found 15 photos so far..."
- Much better UX for complex searches

### How to Use Streaming (iOS Side)

You'll need to implement Server-Sent Events in Swift:

```swift
// Example using URLSession for SSE
let url = URL(string: "https://tunnel.trycloudflare.com/api/search/stream?q=\(query)")!
let task = URLSession.shared.dataTask(with: url) { data, response, error in
    // Parse SSE events
    let lines = String(data: data, encoding: .utf8)?.split(separator: "\n")
    for line in lines {
        if line.hasPrefix("data: ") {
            let json = line.dropFirst(6) // Remove "data: "
            let event = try? JSONDecoder().decode(SearchEvent.self, from: json)
            
            switch event?.type {
            case "status":
                updateUI("Agent starting...")
            case "tool-call":
                updateUI("Using \(event.toolName)...")
            case "partial-results":
                updateUI("Found \(event.total) photos...")
            case "complete":
                showResults(event.results)
            }
        }
    }
}
```

**Note:** The non-streaming endpoint (`/api/search`) still works - streaming is optional for better UX.

---

## Testing the Changes

### 1. Test Enhanced Logging

Run a search and watch your terminal:

```bash
cd photo-agent-server
npm run dev

# In another terminal or from iOS app:
curl "http://localhost:1738/api/search?q=sneakers"
```

You should now see detailed logs like:
```
🤖 Starting agent search...
   Query: "sneakers"
   Model: qwen3-vl:8b
   📤 Sending request to Ollama...
   ✅ Ollama responded in 2341ms
   🔧 Tool call 1: searchByEmbedding
   📦 Got 15 results
   ✅ Agent search complete!
```

### 2. Test Timeout

The timeout will trigger if Ollama hangs. You'll see:
```
⏰ Search timeout after 25000ms: Search timeout - agent took too long to respond
```

And iOS receives:
```json
{
  "success": false,
  "error": "Search timed out. The agent took too long to process your query.",
  "timeout": true
}
```

### 3. Test Streaming

```bash
curl -N "http://localhost:1738/api/search/stream?q=sneakers"
```

You should see events stream in real-time:
```
data: {"type":"status","message":"Agent started processing...","timestamp":0}

data: {"type":"tool-call","toolName":"searchByEmbedding","timestamp":1234}

data: {"type":"partial-results","count":15,"total":15,"timestamp":2345}

data: {"type":"complete","results":[...],"timestamp":3456}
```

### 4. Check Weave Dashboard

Go to your Weave dashboard (Weights & Biases) and you should see:
- `agentSearch` operations with full traces
- Attributes like `toolCallsUsed`, `executionTime`, `resultsReturned`
- Success/failure status for each search
- Model and query details

---

## Next Steps

### Immediate:
1. ✅ Run `npm run dev` in terminal to see enhanced logs
2. ✅ Test a search from iOS app - logs will show progress
3. ✅ If timeout occurs, you'll get a proper error message

### Short-term:
1. **Try a different model** if Qwen3-VL is slow:
   - `ollama pull llama3.1:8b`
   - Change `AGENT_MODEL` in `search-agent.ts`
   - Test search performance

2. **Implement streaming in iOS** (optional):
   - Better UX with progress indicators
   - Shows tool calls as they happen
   - Use URLSession or a Swift SSE library

### Long-term:
1. **Add result caching** - Cache frequent searches
2. **Fallback to direct search** - Skip agent for simple queries
3. **Add search analytics** - Track which queries fail/timeout
4. **Optimize prompts** - Tune system prompt for faster tool selection

---

## Troubleshooting

### Still Getting Timeouts?

**Check:**
1. Is Ollama running? `ollama list`
2. Are there assets in the database? Check SQLite
3. Is the model downloaded? `ollama pull qwen3-vl:8b`
4. Try direct Ollama test:
   ```bash
   curl http://localhost:11434/api/generate -d '{
     "model": "qwen3-vl:8b",
     "prompt": "Call the searchByEmbedding function with query: sneakers"
   }'
   ```

### No Logs Appearing?

**Check:**
1. Server running from terminal? (Not from macOS app)
2. Using `npm run dev` (not `npm start`)?
3. Console visible in terminal?

### Weave Not Tracking?

**Check:**
1. `WANDB_API_KEY` in `.env` file?
2. See "✅ Weave observability initialized" on startup?
3. Check Weave dashboard at wandb.ai
