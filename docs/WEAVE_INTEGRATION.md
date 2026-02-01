# Weave Observability Integration

This document explains how Weave tracing is integrated into the photo-agent system and how to use it.

---

## What is Weave?

Weave is Weights & Biases' observability platform for AI applications. It provides:
- **Automatic tracing** of LLM calls and operations
- **Rich debugging** with full context and attributes
- **Performance monitoring** with timing and throughput metrics
- **Evaluation tools** for measuring accuracy and success rates

---

## Setup

### 1. Get Your Weave API Key

1. Sign up at https://wandb.ai/
2. Go to https://wandb.ai/authorize
3. Copy your API key
4. Add it to `photo-agent-server/.env`:
   ```bash
   WEAVE_API_KEY=your_api_key_here
   ```

### 2. Start the Server

```bash
cd photo-agent-server
npm run dev
```

You should see:
```
✅ Weave observability initialized
```

If you see `⚠️ WEAVE_API_KEY not found - Weave tracing disabled`, check your `.env` file.

---

## What Gets Traced

### All Operations Are Automatically Traced

**Image Upload**
- Content hash (deduplication check)
- Device ID
- Media type (image, video, etc.)
- Whether location data is available

**Image Analysis**
- Model name (`qwen3-vl:8b`)
- Image size (bytes)
- Summary length
- OCR text length
- Embedding dimension (512)

**Intent Classification**
- Intent type (event_flyer, general_photo, other)
- Confidence score (0-1)
- Reasoning

**Intent Routing**
- Routing decision (browserbase_ready or no_action)
- Event flyer detection status

---

## Viewing Traces

### 1. Go to Weave Dashboard
Visit: https://wandb.ai/weave

### 2. Select Project
Navigate to project: **photo-agent**

### 3. Browse Traces
- Click on any trace to see full details
- Expand spans to see nested operations
- View attributes and timing for each step

### 4. Filter and Search
- Filter by operation name: `analyzeImage`, `classifyIntent`
- Filter by attributes: `intentType:event_flyer`
- Search by content hash or asset ID

---

## How It Works

### Service Architecture

```typescript
// src/services/weave.ts

// Initialize once on startup
await initWeave();

// Wrap functions with tracing
export const analyzeImage = createTracedOp('analyzeImage', 
  async (imageData: Buffer) => {
    // ... your function code
  }
);

// Log custom attributes
logAttributes({
  intentType: 'event_flyer',
  confidence: 0.95
});
```

### Traced Operations

1. **`analyzeImage`** - Vision model OCR + summary + embeddings
2. **`classifyIntent`** - Intent classification with Ollama
3. **Image Upload Worker** - Deduplication and storage
4. **Image Analysis Worker** - Coordinate analysis pipeline
5. **Intent Routing Worker** - Classify and route photos

---

## Example Trace

Here's what a complete photo processing trace looks like:

```
📊 Photo Processing (2.3s)
  └─ 📤 Image Upload (120ms)
      ├─ contentHash: "abc123..."
      ├─ deviceId: "mac-12345"
      └─ mediaType: "image"
  
  └─ 🔍 Image Analysis (1.8s)
      ├─ model: "qwen3-vl:8b"
      ├─ imageSize: 245678
      ├─ summaryLength: 156
      ├─ ocrLength: 89
      └─ embeddingDim: 512
  
  └─ 🎯 Intent Classification (400ms)
      ├─ intentType: "event_flyer"
      ├─ confidence: 0.92
      └─ reasoning: "Contains date, venue, and RSVP information"
  
  └─ 🚀 Intent Routing (50ms)
      └─ routingDecision: "browserbase_ready"
```

---

## Debugging with Weave

### Find Failed Jobs
1. Go to Weave dashboard
2. Filter by status: "failed"
3. Inspect error messages and attributes

### Measure Performance
1. View trace timing for each operation
2. Identify bottlenecks in the pipeline
3. Compare performance across different photo types

### Track Intent Classification Accuracy
1. Filter by operation: `classifyIntent`
2. Group by `intentType`
3. View confidence score distribution

### Debug Routing Decisions
1. Filter by `routingDecision:browserbase_ready`
2. Verify event flyers are correctly identified
3. Check confidence scores for false positives/negatives

---

## Custom Attributes

You can add custom attributes to any trace:

```typescript
import { logAttributes } from '../services/weave';

logAttributes({
  customField: 'value',
  processingTime: Date.now(),
  experimentVersion: 'v2'
});
```

These attributes will appear in the Weave UI for filtering and analysis.

---

## Best Practices

### 1. Use Descriptive Operation Names
```typescript
createTracedOp('classifyIntent', fn);  // ✅ Good
createTracedOp('process', fn);         // ❌ Too vague
```

### 2. Log Relevant Attributes
```typescript
logAttributes({
  intentType: classification.intentType,  // ✅ Useful for filtering
  confidence: classification.confidence,  // ✅ Useful for analysis
  rawResponse: fullLLMOutput             // ❌ Too verbose, use sparingly
});
```

### 3. Don't Log Sensitive Data
```typescript
logAttributes({
  deviceId: '...',        // ✅ OK - no PII
  photoContent: '...'     // ❌ Could contain sensitive info
});
```

---

## Troubleshooting

### Traces Not Appearing

**Issue**: No traces showing up in Weave dashboard

**Solutions**:
1. Check `WEAVE_API_KEY` is set in `.env`
2. Restart server: `npm run dev`
3. Verify initialization: Look for "✅ Weave observability initialized" in logs
4. Check network connectivity to wandb.ai

### API Key Errors

**Issue**: "Invalid API key" or authentication errors

**Solutions**:
1. Verify API key is correct (no spaces, complete key)
2. Check key hasn't expired: https://wandb.ai/authorize
3. Regenerate key if needed

### Missing Attributes

**Issue**: Attributes not showing up in traces

**Solutions**:
1. Ensure `logAttributes()` is called within a traced operation
2. Check attribute values are serializable (no circular references)
3. Verify `weaveClient` is initialized before logging

---

## Performance Impact

Weave tracing has minimal performance impact:
- **Network overhead**: Traces sent asynchronously
- **Memory**: ~1-2MB per 1000 traces
- **CPU**: < 1% additional overhead
- **Latency**: < 10ms per operation

If you need to disable tracing temporarily:
1. Remove `WEAVE_API_KEY` from `.env`
2. Restart server
3. System will run normally without tracing

---

## Next Steps

With Weave integrated, you can:
1. ✅ **Monitor** all operations in real-time
2. ✅ **Debug** failures with full context
3. ✅ **Optimize** performance bottlenecks
4. ✅ **Evaluate** intent classification accuracy
5. ✅ **Compare** different model versions

In Phase 3, we'll add:
- Browserbase session tracing
- RSVP success/failure tracking
- Calendar integration monitoring
- Approval/rejection event logging

---

## Resources

- **Weave Docs**: https://docs.wandb.ai/weave
- **TypeScript SDK**: https://docs.wandb.ai/weave/reference/typescript-sdk
- **Dashboard**: https://wandb.ai/weave
- **Community**: https://community.wandb.ai/
