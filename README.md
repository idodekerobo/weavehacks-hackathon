# Photos-as-Intent Agent

A **self-hosted, privacy-first** agent that lives in your Photos library and turns screenshots and photographs into organized intent and completed actions.

## Project Structure

```
weavehacks/
├── photo-agent-macos/        # macOS app (Swift) - Home Base control center
├── photo-agent-ios/          # iOS app (Swift) - Companion for on-the-go
├── photo-agent-server/       # Node.js/Express server (TypeScript)
├── admin-dashboard/          # Next.js admin dashboard (TypeScript)
└── docs/                     # Documentation
    └── PRD.md               # Product Requirements Document
```

## Quick Start

### 1. Node.js Server

```bash
cd photo-agent-server
npm install
cp .env.example .env
npm run dev
```

The server will run at `http://localhost:1738`

### 2. Admin Dashboard

```bash
cd admin-dashboard
npm install
npm run dev
```

The dashboard will run at `http://localhost:3000` (or next available port)

### 3. macOS App

Open `photo-agent-macos/photo-agent-macos.xcodeproj` in Xcode and run.

### 4. iOS App

Open `photo-agent-ios/photo-agent-ios.xcodeproj` in Xcode and run.

## Core Concept

**"Photos are intent"** - Users already record their intent via images:
- Screenshots of event flyers, posters, emails
- Photos of posters on walls
- Event pages from social media

This system recognizes these patterns, enriches them on the web, and executes actions with your approval.

## Tech Stack

- **macOS/iOS Apps**: Swift + SwiftUI
- **Server**: Node.js + Express + TypeScript
- **Admin Dashboard**: Next.js + TypeScript + Tailwind CSS
- **Agent Orchestration**: Redis
- **Web Automation**: Browserbase
- **Observability**: Weave
- **Voice (Future)**: Daily/Pipecat via Modal

## Features (In Development)

- ✅ Initial project structure
- 🚧 Photo library access and ingestion
- 🚧 Local OCR and vision models
- 🚧 Event flyer detection
- 🚧 Web enrichment via Browserbase
- 🚧 HITL approval workflow
- 🚧 Calendar integration
- 🚧 Weave observability

## Development

This is a hackathon project focused on making sponsor tooling (Weave, Browserbase, Redis) central and visible in the product.

See `docs/PRD.md` for full product requirements.

## License

ISC
