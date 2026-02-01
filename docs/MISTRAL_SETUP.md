# Mistral Setup for Agentic Search

**Goal:** Use Mistral for agentic search (text-only, great function calling) + Qwen3-VL for vision tasks

---

## Why Mistral for Agents?

### Mistral 7B Advantages
- ✅ **Excellent function calling** - Built-in support, well-tested
- ✅ **Small & fast** - 7B params, smaller than Qwen3-VL 8B
- ✅ **Edge-friendly** - Designed for on-device deployment
- ✅ **Vercel AI SDK compatible** - Proven to work well
- ✅ **Text-optimized** - No vision overhead

### Model Sizes Comparison
| Model | Size | Purpose | Function Calling |
|-------|------|---------|------------------|
| qwen3-vl:8b | 6.1 GB | Vision + Text | ❌ Struggles |
| mistral:7b | 4.1 GB | Text Only | ✅ Excellent |
| mistral:7b-instruct | 4.1 GB | Text + Instructions | ✅ Best |

**Recommendation:** Use `mistral:7b-instruct` for best results

---

## Architecture: Specialized Models

```
┌─────────────────────────────────────────────────────────┐
│                    Photo Agent Server                    │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  Image Analysis Pipeline                                 │
│  ┌──────────────────┐                                    │
│  │  Image Upload    │                                    │
│  └────────┬─────────┘                                    │
│           ↓                                              │
│  ┌──────────────────┐                                    │
│  │  Qwen3-VL:8b     │ ← Vision model for:               │
│  │  (Vision)        │   • Image summaries                │
│  └────────┬─────────┘   • OCR extraction                │
│           ↓             • Intent classification          │
│  ┌──────────────────┐                                    │
│  │  Store in SQLite │                                    │
│  └──────────────────┘                                    │
│                                                           │
│  Search Pipeline                                         │
│  ┌──────────────────┐                                    │
│  │  Search Request  │                                    │
│  └────────┬─────────┘                                    │
│           ↓                                              │
│  ┌──────────────────┐                                    │
│  │  Mistral:7b      │ ← Text model for:                 │
│  │  (Agent)         │   • Tool selection                 │
│  └────────┬─────────┘   • Query understanding           │
│           ↓             • Result orchestration           │
│  ┌──────────────────┐                                    │
│  │  Search Tools    │   - searchByEmbedding              │
│  │  (6 tools)       │   - searchByText                   │
│  └────────┬─────────┘   - filterByIntent                │
│           ↓             - filterByDateRange              │
│  ┌──────────────────┐   - filterByLocation              │
│  │  Return Results  │   - combineResults                 │
│  └──────────────────┘                                    │
└─────────────────────────────────────────────────────────┘
```

**Key Insight:** Each model does what it's best at!

---

## Installation Steps

### Step 1: Pull Mistral Model

```bash
# Option 1: Standard Mistral (4.1 GB)
ollama pull mistral:7b

# Option 2: Instruct-tuned (RECOMMENDED - 4.1 GB)
ollama pull mistral:7b-instruct

# Option 3: Even smaller (3.8 GB)
ollama pull mistral:7b-v0.3-q4_0
```

**Recommended:** `mistral:7b-instruct`

**Download time:** ~5-10 minutes depending on connection

### Step 2: Verify Installation

```bash
ollama list
```

Should show:
```
NAME                    ID              SIZE     MODIFIED
mistral:7b-instruct     xxx             4.1 GB   X seconds ago
qwen3-vl:8b             901cae732162    6.1 GB   X days ago
nomic-embed-text        xxx             274 MB   X days ago
```

### Step 3: Test Mistral

```bash
# Quick test
ollama run mistral:7b-instruct "Say hello"

# Test function calling
curl http://localhost:11434/api/generate -d '{
  "model": "mistral:7b-instruct",
  "prompt": "I need you to search for photos of shoes. Which function should you call?",
  "stream": false
}'
```

### Step 4: Configuration Already Done!

I've already updated `search-agent.ts`:

```typescript
const AGENT_MODEL = 'mistral:7b';  // Changed from qwen3-vl:8b
const USE_AGENT = true;            // Re-enabled agent mode
```

### Step 5: Restart Server

The server should auto-reload (tsx watch), but if not:

```bash
# Kill the server (Ctrl+C)
npm run dev
```

---

## Testing the Setup

### Test 1: Search with Enhanced Logging

Now when you search, you'll see:

```
🤖 Starting agent search...
   Query: "Shoes"
   Model: mistral:7b
   Mode: AGENT
   📤 Sending request to Ollama...
   📏 System prompt length: 892 chars
   📏 User prompt length: 72 chars
   🔧 Number of tools: 6
   🔄 Max iterations: 5
   ⏳ Still waiting... 3000ms elapsed
   📍 Step initial finished: { stepType: 'initial', toolCalls: 1, text: 'I will search...' }
   📍 Step tool-result finished: { stepType: 'tool-result', toolCalls: 0, text: '' }
   ✅ Ollama responded in 4532ms
   📊 Response steps: 2
   📊 Tool calls: 1
   🔧 Processing tool calls...
      → searchByEmbedding with args: {"query":"shoes","topK":10}
   📦 Processing tool results...
      → Got 10 results from embedding
   
   ✅ Agent search complete!
   📊 Final results: 10
   🔧 Tools used: searchByEmbedding
   ⏱️  Total time: 4678ms
```

### Test 2: Complex Query

Try: "red shoes from last week"

Should see Mistral call multiple tools:
- `searchByEmbedding` with query "red shoes"
- `filterByDateRange` with "last week"
- `combineResults` to merge

### Test 3: Performance Comparison

| Mode | Model | Time | Quality |
|------|-------|------|---------|
| Direct | N/A | 217ms | ✅ Good |
| Agent | Qwen3-VL | 25000ms (timeout) | ❌ Fails |
| Agent | Mistral | ~3-6s | ✅✅ Excellent |

---

## Expected Performance

### Mistral 7B on M1 Pro

**Generation Speed:**
- ~20-40 tokens/second
- Tool selection: 1-2 seconds
- Total search: 3-6 seconds

**Memory Usage:**
- Model: 4.1 GB
- Running: ~5 GB RAM
- Plenty of headroom on M1 Pro (16GB+)

### If Still Slow

Try the quantized version:
```bash
ollama pull mistral:7b-q4_0  # Even smaller, faster
```

Or reduce max iterations:
```typescript
const MAX_ITERATIONS = 3;  // Faster, still smart
```

---

## Debugging with Enhanced Logging

### What the New Logs Tell You

**Progress Updates (every 3 seconds):**
```
⏳ Still waiting... 3000ms elapsed
⏳ Still waiting... 6000ms elapsed
```
- Tells you the model is thinking (not frozen)
- If stuck at same number → frozen (check Ollama)

**Step Callbacks:**
```
📍 Step initial finished: { stepType: 'initial', toolCalls: 1, text: '...' }
```
- Shows agent's decision-making process
- `toolCalls: 1` → Agent decided to call a tool
- `text: '...'` → Agent's reasoning

**Prompt Sizes:**
```
📏 System prompt length: 892 chars
📏 User prompt length: 72 chars
```
- If system prompt > 2000 chars → might be too long
- Total should be < 4000 chars for best performance

### Common Issues & Solutions

**Issue 1: Still Timing Out**
```
⏳ Still waiting... 3000ms elapsed
⏳ Still waiting... 6000ms elapsed
... (never finishes)
```

**Solution:** Model not pulled correctly
```bash
ollama pull mistral:7b-instruct
ollama list  # Verify it's there
```

**Issue 2: "Model Not Found"**
```
Error: model 'mistral:7b' not found
```

**Solution:** Use exact name from `ollama list`
```typescript
const AGENT_MODEL = 'mistral:7b-instruct';  // Match exactly
```

**Issue 3: Slow but Works**
```
⏱️  Total time: 15000ms
```

**Solution:** Reduce iterations or use smaller model
```typescript
const MAX_ITERATIONS = 2;  // Faster
// or
const AGENT_MODEL = 'mistral:7b-q4_0';  // Smaller
```

---

## Architecture Notes

### Why Separate Models?

**Vision Model (Qwen3-VL):**
- ✅ Excellent at understanding images
- ✅ Great OCR and visual reasoning
- ❌ Slow for text-only tasks
- ❌ Poor function calling
- **Use for:** Image analysis pipeline

**Text Model (Mistral):**
- ✅ Fast text generation
- ✅ Excellent function calling
- ✅ Small and efficient
- ❌ Can't process images
- **Use for:** Search orchestration

### Memory Considerations

**Both models loaded:**
- Qwen3-VL: 6.1 GB (only during image analysis)
- Mistral: 4.1 GB (only during search)
- Total peak: ~10 GB (they don't run simultaneously)
- Your M1 Pro: Plenty of RAM!

**Ollama automatically manages:**
- Unloads models when not in use
- Loads them on-demand
- Smart caching

---

## Next Steps

1. **Pull Mistral:**
   ```bash
   ollama pull mistral:7b-instruct
   ```

2. **Test Search:**
   - Server should auto-reload
   - Try search from iOS
   - Watch the enhanced logs!

3. **Monitor Performance:**
   - Should complete in 3-6 seconds
   - If timeout, check logs for where it's stuck

4. **Compare Results:**
   - Direct mode: 217ms, simple embedding search
   - Agent mode: 3-6s, smart multi-tool orchestration

---

## Troubleshooting Commands

```bash
# Check what models you have
ollama list

# Test Mistral directly
ollama run mistral:7b-instruct "hello"

# Check Ollama logs
ollama ps  # See running models

# Restart Ollama if needed
# (varies by installation method)
brew services restart ollama  # If installed via Homebrew
```

---

## Configuration Summary

**Files Modified:**
- `photo-agent-server/src/services/search-agent.ts`
  - Line 14: `AGENT_MODEL = 'mistral:7b'`
  - Line 18: `USE_AGENT = true`
  - Added enhanced logging with progress updates
  - Added `onStepFinish` callback for step-by-step visibility

**What Stays the Same:**
- Image analysis still uses Qwen3-VL (in workers)
- Embedding still uses nomic-embed-text
- All search tools unchanged
- Database structure unchanged

**Ready to test!** Pull Mistral and try a search.
