# Implementation Notes

**Last Updated:** Jan 31, 2026

## Resolved Decisions from PRD

### Tunnel Provider
**Decision:** Cloudflare Tunnel  
**Implementation:** Using quick tunnels via trycloudflare.com for easy setup without account configuration.

### Vision Models
**Decision:** Qwen3-VL:8b for vision/OCR, nomic-embed-text for embeddings  
**Rationale:**
- Qwen3-VL:8b chosen over LLaVA for superior OCR performance and spatial understanding
- Handles flyer layouts better with 256K context window
- nomic-embed-text provides 768-dim vectors for semantic search
- Total model size: ~5.3GB (manageable for MacBook)

### Architecture Decisions

#### Image Analysis Flow
- **Swift → Ollama direct** (bypassing Node for analysis)
- Faster performance by avoiding middleware
- Results sent to Node server for SQLite persistence

#### Parallel Processing
- 4 concurrent image analyses (configurable via `MAX_CONCURRENT_ANALYSES` in ModelManager.swift)
- Using Swift Concurrency (TaskGroup) for parallel execution
- Batch processing to avoid overwhelming the system

#### Summary Generation
Using custom prompt for opinionated summaries:
```
Your task is to create an opinionated summary of this image and an explanation of your reasoning for generating the summary. The summary is going to be later used for retrieval via search, categorization and other downstream tasks. The summary shouldn't be longer than 4 sentences.

Things to focus on:
- include what the image/scene is
- colors
- defining qualities of the image
- if it is pictures of people, describe the relationship between the people
- describe the foreground and background of the image
- if the image is mostly text (e.g. book/essay/article screenshot, social media post that is mostly text, informational flyer/poster) make sure the summary describes the text content or theme
```

#### Data Fields
Each analyzed photo includes:
- **OCR text** - All extracted text for search and classification
- **Summary** - Natural language description for retrieval
- **Embedding** - 768-dim vector for semantic similarity

### Storage Strategy
- **Metadata only** during scan (fast, 1-2 seconds for 1000 photos)
- **Analysis on-demand** via "Analyze Photos" button (slower, 3-5 seconds per photo)
- Results sent to Node server `/api/assets` endpoint
- SQLite persistence (to be implemented in Milestone E)

### User Experience
- Two-step flow: Scan metadata → Analyze images
- Manual trigger for analysis (via button)
- Progress tracking in UI
- Dependency checks (Ollama must be running, photos must be scanned)

## Next Steps (Milestone E)
- Implement SQLite database on Node server
- Store analyzed assets persistently
- Add CRUD endpoints for querying results
