# Redis + Workers Architecture

**Date:** Feb 1, 2026  
**Approach:** Standard Redis with separate worker processes

---

## Architecture Overview

### Components

1. **Redis Service** (separate process)
   - Runs as system service: `brew services start redis`
   - Or via Docker: `docker run -d -p 6379:6379 redis`
   - Standard port: 6379

2. **Node Server** (main process)
   - Express API server
   - Bull queue management
   - Bull Board UI
   - Port: 1738

3. **Workers** (separate process)
   - Process Bull queue jobs
   - Runs concurrently with server
   - Auto-restart on file changes (dev mode)

---

## npm Scripts Configuration

### package.json
```json
{
  "scripts": {
    "dev": "concurrently \"npm run dev:server\" \"npm run dev:workers\"",
    "dev:server": "ts-node-dev --respawn --transpile-only src/index.ts",
    "dev:workers": "ts-node-dev --respawn --transpile-only src/workers/index.ts",
    "start": "node dist/index.js",
    "worker": "node dist/workers/index.js",
    "build": "tsc"
  }
}
```

### What Each Script Does

- **`npm run dev`** - Development mode
  - Runs server + workers concurrently
  - Hot reload on file changes
  - Single command to start everything

- **`npm run dev:server`** - Server only
  - Express API
  - Bull Board UI
  - No workers (for debugging API separately)

- **`npm run dev:workers`** - Workers only
  - Process queue jobs
  - No HTTP server (for debugging workers separately)

- **`npm start`** - Production server
  - Compiled TypeScript
  - No hot reload

- **`npm run worker`** - Production workers
  - Compiled TypeScript
  - Run separately (e.g., in PM2 or Docker)

---

## Process Architecture Diagram

```
User runs: npm run dev
  │
  ├─> concurrently spawns:
  │
  ├─> Process 1: dev:server (PID 1234)
  │   └─> ts-node-dev src/index.ts
  │       ├─> Express server (port 1738)
  │       ├─> Bull Board UI (/admin/queues)
  │       └─> ioredis client → connects to Redis
  │
  └─> Process 2: dev:workers (PID 5678)
      └─> ts-node-dev src/workers/index.ts
          ├─> image-upload worker
          ├─> image-analysis worker
          └─> intent-routing worker
          └─> ioredis client → connects to Redis
              │
              ↓
        ┌─────────────────────┐
        │  Redis (PID 9012)   │
        │  Port: 6379         │
        │  (system service)   │
        └─────────────────────┘
```

---

## Worker Implementation

### src/workers/index.ts (entry point)
```typescript
// Central workers entry point
import './image-upload';
import './image-analysis';
import './intent-routing';

console.log('✅ All workers started');

process.on('SIGTERM', () => {
  console.log('🛑 Shutting down workers...');
  process.exit(0);
});
```

### src/workers/image-upload.ts (example worker)
```typescript
import { imageUploadQueue } from '../services/queue';
import { db } from '../db/sqlite';

imageUploadQueue.process(async (job) => {
  const { imageData, contentHash, ...metadata } = job.data;
  
  // Check dedupe
  const existing = db.prepare('SELECT id FROM assets WHERE contentHash = ?').get(contentHash);
  if (existing) {
    return { deduplicated: true, assetId: existing.id };
  }
  
  // Store new asset
  const assetId = uuidv4();
  db.prepare('INSERT INTO assets (...) VALUES (...)').run(...);
  
  // Enqueue for analysis
  await imageAnalysisQueue.add({ assetId });
  
  return { assetId };
});

console.log('✅ Image upload worker started');
```

---

## ioredis Configuration

### src/services/queue.ts
```typescript
import Bull from 'bull';
import IORedis from 'ioredis';

const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy: (times: number) => {
    if (times > 10) {
      console.error('❌ Could not connect to Redis');
      return null;
    }
    return Math.min(times * 50, 2000);
  }
};

export const imageUploadQueue = new Bull('image-upload', {
  redis: redisConfig
});

// Connection event handlers
imageUploadQueue.client.on('ready', () => {
  console.log('✅ Bull queues connected to Redis');
});

imageUploadQueue.client.on('error', (err) => {
  console.error('❌ Redis connection error:', err.message);
});
```

---

## Development Workflow

### Starting Everything
```bash
# Terminal 1: Start Redis
brew services start redis

# Terminal 2: Start server + workers
cd photo-agent-server
npm run dev

# Output:
# [server] 🚀 Server running on http://localhost:1738
# [workers] ✅ Image upload worker started
# [workers] ✅ Image analysis worker started
# [server] ✅ Bull queues connected to Redis
```

### Debugging Server Only
```bash
npm run dev:server
# Workers not running - queue jobs will accumulate
```

### Debugging Workers Only
```bash
npm run dev:workers
# No HTTP server - can test queue processing independently
```

---

## Production Deployment

### Option 1: Single Server (Simple)
```bash
# Build
npm run build

# Start in production
npm start &        # Server in background
npm run worker &   # Workers in background
```

### Option 2: PM2 (Recommended)
```javascript
// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'photo-agent-server',
      script: 'dist/index.js',
      instances: 1,
    },
    {
      name: 'photo-agent-workers',
      script: 'dist/workers/index.js',
      instances: 2, // Multiple worker instances for concurrency
    }
  ]
};
```

```bash
pm2 start ecosystem.config.js
```

### Option 3: Docker Compose
```yaml
# docker-compose.yml
version: '3.8'
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
  
  server:
    build: .
    command: npm start
    ports:
      - "1738:1738"
    depends_on:
      - redis
  
  workers:
    build: .
    command: npm run worker
    depends_on:
      - redis
    deploy:
      replicas: 2
```

---

## Why This Approach?

### Pros ✅
1. **Industry standard** - Redis as separate service is how it's done in production
2. **Scalability** - Can scale workers independently (multiple instances)
3. **Isolation** - Workers crash won't bring down API server
4. **Flexibility** - Can run workers on different machines
5. **Monitoring** - Bull Board shows all queues across processes
6. **Development** - Hot reload for both server and workers independently

### Cons ⚠️
1. **Setup** - Requires Redis to be running separately
2. **Complexity** - Three processes to manage (Redis, server, workers)

### Verdict
This is the **correct approach** for a real system. The small setup cost (starting Redis) is worth the benefits.

---

## Redis Setup Options

### Option 1: Homebrew (macOS)
```bash
brew install redis
brew services start redis
```

### Option 2: Docker
```bash
docker run -d --name redis -p 6379:6379 redis:7-alpine
```

### Option 3: Docker Compose (with project)
```yaml
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
```

```bash
docker-compose up -d redis
```

---

## Monitoring & Debugging

### Bull Board UI
```bash
# Access at:
open http://localhost:1738/admin/queues

# Shows:
# - Active jobs
# - Completed jobs
# - Failed jobs
# - Queue stats
# - Job details
```

### Redis CLI
```bash
# Connect
redis-cli

# Check connection
> PING
PONG

# List all keys
> KEYS *

# Check queue length
> LLEN bull:image-upload:wait
```

### Process Management
```bash
# Check what's running
ps aux | grep node

# Check ports
lsof -i :1738  # Server
lsof -i :6379  # Redis

# Stop everything
# Ctrl+C in terminal (stops concurrently, which stops both processes)
```

---

## Error Handling

### Redis Not Running
```
❌ Redis connection error: connect ECONNREFUSED 127.0.0.1:6379
⚠️  Make sure Redis is running: brew services start redis
```

**Solution:**
```bash
brew services start redis
# or
docker run -d -p 6379:6379 redis
```

### Port Already in Use
```
Error: listen EADDRINUSE: address already in use :::1738
```

**Solution:**
```bash
lsof -i :1738
kill -9 <PID>
```

### Workers Not Processing
1. Check Bull Board: http://localhost:1738/admin/queues
2. Verify workers are running: `ps aux | grep workers`
3. Check worker logs for errors
4. Restart workers: Kill terminal, `npm run dev:workers`

---

## Documentation Updates

All documents have been updated to reflect this architecture:

- ✅ `docs/PRD.md` - Updated Redis section
- ✅ `docs/PROGRESS.md` - Updated Milestone F, Quick Commands, Notes
- ✅ `docs/REFACTOR_PLAN.md` - Updated dependencies, queue service, package.json
- ✅ `docs/REDIS_WORKERS.md` - This document (replaces EMBEDDED_REDIS.md)

**One source of truth:** Standard Redis + separate worker processes via npm scripts.
