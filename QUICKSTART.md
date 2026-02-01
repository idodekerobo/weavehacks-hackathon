# Quick Start Guide

## Running All Components

### Terminal 1: Start the Node.js Server

```bash
cd photo-agent-server
npm run dev
```

Server will be available at: `http://localhost:1738`

### Terminal 2: Start the Admin Dashboard

```bash
cd admin-dashboard
npm run dev
```

Dashboard will be available at: `http://localhost:3000`

### Xcode: Open macOS App

1. Open `photo-agent-macos/photo-agent-macos.xcodeproj` in Xcode
2. Select your Mac as the target
3. Press `Cmd + R` to run

### Xcode: Open iOS App

1. Open `photo-agent-ios/photo-agent-ios.xcodeproj` in Xcode
2. Select an iPhone simulator or device
3. Press `Cmd + R` to run

## Verify Everything is Running

### Check the Server

```bash
curl http://localhost:1738/
# Should return: {"message":"Photos Agent Server - Hello World",...}

curl http://localhost:1738/api/system/status
# Should return system status JSON
```

### Check the Dashboard

Open your browser to `http://localhost:3000` - you should see the Photos Agent Admin Dashboard

### Check the Apps

- **macOS**: Should show "Photos Agent - Home Base" with status indicators
- **iOS**: Should show "Photos Agent - Companion" with feature cards

## Testing the Full Stack

1. **Server is running** ✅ - Confirmed at http://localhost:1738
2. **Dashboard is accessible** - Visit http://localhost:3000
3. **macOS app launches** - Run from Xcode
4. **iOS app launches** - Run from Xcode

All components are independent right now and show their "hello world" versions. Next steps involve wiring them together!

## Environment Configuration

The server uses environment variables from `.env`:

```bash
PORT=1738
NODE_ENV=development
REDIS_URL=redis://localhost:6379
BROWSERBASE_API_KEY=<your-key-here>
WEAVE_API_KEY=<your-key-here>
```

Add your API keys when you're ready to integrate Redis, Browserbase, and Weave.

## Troubleshooting

### Port Already in Use

If port 3001 is in use:
```bash
# Find the process
lsof -i :1738

# Kill it if needed
kill -9 <PID>
```

Or change the PORT in `.env` file.

### Dependencies Missing

```bash
# Server
cd photo-agent-server && npm install

# Dashboard
cd admin-dashboard && npm install
```

## What's Next?

See `docs/PRD.md` for the full product vision and `docs/SETUP_COMPLETE.md` for implementation details.

Key next steps:
1. Integrate Photos library access in macOS app
2. Add Redis for queue management
3. Integrate Weave for observability
4. Add Browserbase for web automation
5. Wire up the dashboard to show real data from the server
