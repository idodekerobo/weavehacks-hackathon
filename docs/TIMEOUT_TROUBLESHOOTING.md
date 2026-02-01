# Search Timeout Troubleshooting

**Issue:** Search times out after 25 seconds  
**Root Cause:** Ollama/qwen3-vl:8b is not responding to tool calling requests  
**Your Hardware:** M1 Pro MacBook (perfectly capable - NOT the problem!)

---

## What's Actually Happening

Looking at your logs:
```
[0]    📤 Sending request to Ollama...
[0] ⏰ Search timeout after 25003ms
```

**Ollama never responded.** The model hung trying to process the tool calling request.

### Why This Happens

**Qwen3-VL is a Vision Model** designed for:
- Understanding images and videos
- Visual tool calling (clicking UI elements)
- GUI automation tasks

**But you're asking it to:**
- Process text-only queries
- Execute function calls with complex JSON schemas
- Work with the Vercel AI SDK's tool format

It's like asking a painter to compose music - related creative fields, but completely different skills!

---

## Solutions (In Order of Recommendation)

### ✅ Solution 1: Test Without Agent (FASTEST)

I just added a fallback mode that bypasses the agent entirely. This will tell us if the issue is the agent or something else.

**Step 1:** The fallback is already enabled in your code (`USE_AGENT = false`)

**Step 2:** Your server should auto-reload (tsx watch)

**Step 3:** Try the search again from iOS

**Expected behavior:**
```
🤖 Starting agent search...
   Mode: DIRECT (no agent)
   🔧 Using direct search (bypassing agent)...
   🔍 Embedding search: "Shoes" (top 10)
   ✅ Direct search complete!
   📊 Results: 10
   ⏱️  Total time: 1234ms
```

**If this works:** The issue is definitely the agent/model compatibility.

**If this still fails:** Check if Ollama embeddings are working (separate issue).

### ✅ Solution 2: Switch to Llama 3.1 (RECOMMENDED)

Llama has excellent built-in function calling support.

**Step 1:** Pull the model
```bash
ollama pull llama3.1:8b
```

**Step 2:** Edit `search-agent.ts` line 14:
```typescript
const AGENT_MODEL = 'llama3.1:8b';  // Change from qwen3-vl:8b
const USE_AGENT = true;              // Re-enable agent mode
```

**Step 3:** Restart server and test

**Expected:** Much faster responses (3-5 seconds instead of timeout)

### ✅ Solution 3: Try Smaller Qwen Models

Maybe 8B is too large for your setup:

```bash
ollama pull qwen3-vl:2b
# or
ollama pull qwen3-vl:4b
```

Then change line 14 to use the smaller model.

### ✅ Solution 4: Test Ollama Directly

Verify Ollama itself is working:

```bash
# Test basic generation
curl http://localhost:11434/api/generate -d '{
  "model": "qwen3-vl:8b",
  "prompt": "Hello world",
  "stream": false
}'
```

**If this hangs:** Ollama is having issues (not your code)
**If this works:** Confirms it's the tool calling interface

---

## Quick Testing Steps

### Test 1: Direct Mode (Already Enabled)

Just run a search from iOS. You should see instant results (no 25s wait).

### Test 2: Check What's in Database

```bash
cd photo-agent-server
sqlite3 data/photo-agent.db
> SELECT COUNT(*) FROM assets WHERE embedding IS NOT NULL;
> SELECT filename, summary FROM assets LIMIT 3;
> .quit
```

If there are 0 assets, nothing to search!

### Test 3: Test Embeddings Directly

```bash
curl http://localhost:11434/api/embeddings -d '{
  "model": "nomic-embed-text",
  "prompt": "test query"
}'
```

Should return immediately with a vector array.

---

## Understanding the Performance

### M1 Pro Performance Reference

Your M1 Pro should handle:
- **Embeddings (nomic-embed-text):** ~100-200ms
- **Text generation (8B model):** 5-30 tokens/sec
- **Vision model (qwen3-vl:8b):** 2-10 tokens/sec
- **Total search with agent:** 3-8 seconds (not 25!)

**If timing out:** Something is fundamentally wrong with the model's response to tool calls, not performance.

### Where Time Should Go

**Ideal breakdown for agent search:**
```
1. Generate query embedding:       100-300ms
2. Search SQLite by similarity:    10-50ms
3. Agent decides which tools:      2-5 seconds
4. Format and return results:      10-50ms
───────────────────────────────────────────
Total:                            ~3-6 seconds
```

**Your current issue:**
```
1. Send request to Ollama...
2. [Model never responds - hangs forever]
3. Timeout at 25 seconds
```

---

## What to Try Right Now

### Immediate Test (Already Set Up)
1. Make sure your server restarted after my changes
2. Run search from iOS
3. Check if it completes in ~1-2 seconds instead of timing out
4. Look for "Mode: DIRECT (no agent)" in logs

### If Direct Mode Works
Your model has tool calling issues. Switch to:
- `llama3.1:8b` (best for tool calling)
- `mistral` (also excellent)
- Or keep direct mode (good enough for MVP!)

### If Direct Mode Also Fails
Check:
1. Is Ollama running? `ollama list`
2. Is nomic-embed-text model present?
3. Try the embedding test above
4. Check disk space (models are large)

---

## Direct Mode vs Agent Mode

### Direct Mode (Current)
**Pros:**
- ✅ Fast (~1-2 seconds)
- ✅ Reliable (no model dependencies)
- ✅ Always uses semantic search
- ✅ Good enough for MVP

**Cons:**
- ❌ Can't do complex multi-tool queries
- ❌ No smart tool selection
- ❌ Always uses embedding (can't do date filters, etc.)

### Agent Mode (When Fixed)
**Pros:**
- ✅ Smart tool selection
- ✅ Can combine multiple searches
- ✅ Natural language understanding
- ✅ Handles complex queries ("red shoes from last week")

**Cons:**
- ❌ Slower (3-6 seconds)
- ❌ Depends on model quality
- ❌ Can make wrong tool choices

**Recommendation:** For hackathon demo, direct mode is perfectly fine! You can always add the agent later.

---

## Next Steps

1. **Test direct mode** (should work now)
2. **If it works:** Keep it for demo, or try llama3.1
3. **If it fails:** Debug Ollama embeddings
4. **For production:** Consider using llama3.1 or mistral for agent mode

Your hardware is not the issue - it's a model compatibility problem!
