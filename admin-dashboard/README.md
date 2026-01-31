# Photos Agent - Admin Dashboard

Admin dashboard for the Photos-as-Intent Agent system.

## Features

- **Live Runs**: Monitor agent processing runs with Weave traces
- **Approvals Inbox**: Manage human-in-the-loop approval requests
- **Browser Sessions**: View Browserbase automation sessions with Live View
- **Weave Traces**: End-to-end observability and debugging

## Quick Start

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

Open [http://localhost:3000](http://localhost:3000) to view the dashboard.

## Tech Stack

- **Framework**: Next.js 16 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Integration**: Connects to local Node.js/Express server

## Development

The dashboard is designed to work with the local Express server running at `http://localhost:3000`. Configure the API endpoint in your environment variables if needed.
