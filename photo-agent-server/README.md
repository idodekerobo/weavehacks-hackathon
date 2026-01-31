# Photo Agent Server

Local Node.js/Express server for the Photos-as-Intent Agent.

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Run in development mode
npm run dev

# Build for production
npm run build

# Run production build
npm start
```

## Endpoints

- `GET /` - Server info
- `GET /health` - Health check
- `GET /api/photos` - List photos
- `POST /api/photos/upload` - Upload new photo
- `GET /api/intents` - List detected intents
- `GET /api/approvals` - List pending approvals
- `POST /api/approvals/:id/approve` - Approve an action
- `GET /api/system/status` - System status

## Tech Stack

- TypeScript
- Express
- Redis (coming soon)
- Browserbase (coming soon)
- Weave (coming soon)
