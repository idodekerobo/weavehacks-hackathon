# Google Calendar Integration Setup Guide

## Overview
Milestone M implements Google Calendar integration using OAuth 2.0. Events are automatically added to the user's Google Calendar when they approve event flyers.

## Implementation Details

### Architecture
- **Google Calendar API** via `googleapis` npm package
- **OAuth 2.0** for secure user authentication
- **Automatic creation** when approvals are approved
- **Duplicate detection** by event name + date
- **All-day events** for ambiguous times

### Components
1. **Server Side**:
   - `src/services/google-calendar.ts` - Calendar API client
   - `src/routes/oauth.ts` - OAuth endpoints
   - `src/workers/calendar-creation.ts` - Background worker
   
2. **Client Side**:
   - macOS Settings UI with Connect/Disconnect
   - iOS Settings UI with Connect/Disconnect

## Google Cloud Console Setup

### Step 1: Create a Project
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing project
3. Note your Project ID

### Step 2: Enable Google Calendar API
1. Navigate to "APIs & Services" → "Library"
2. Search for "Google Calendar API"
3. Click "Enable"

### Step 3: Configure OAuth Consent Screen
1. Navigate to "APIs & Services" → "OAuth consent screen"
2. Select "External" user type (or "Internal" if using Google Workspace)
3. Fill in required fields:
   - App name: "Photos-as-Intent Agent"
   - User support email: your email
   - Developer contact: your email
4. Add scopes:
   - `https://www.googleapis.com/auth/calendar.events`
   - `https://www.googleapis.com/auth/calendar.readonly`
5. Add test users (your email for testing)
6. Save and continue

### Step 4: Create OAuth 2.0 Credentials
1. Navigate to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "OAuth client ID"
3. Application type: "Web application"
4. Name: "Photos Agent Server"
5. Authorized redirect URIs:
   - `http://localhost:1738/api/oauth/google/callback`
   - (Add tunnel URL later if using ngrok/cloudflare)
6. Click "Create"
7. **Save the Client ID and Client Secret**

## Server Configuration

### Environment Variables
Add to `photo-agent-server/.env`:

```bash
# Google Calendar OAuth (required for calendar integration)
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:1738/api/oauth/google/callback
```

### Database Schema
Tables are created automatically on server start:

```sql
-- OAuth tokens (singleton table)
CREATE TABLE oauth_tokens (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  provider TEXT NOT NULL,
  accessToken TEXT NOT NULL,
  refreshToken TEXT NOT NULL,
  tokenType TEXT DEFAULT 'Bearer',
  expiresAt TEXT,
  scope TEXT,
  connectedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Calendar fields in approvals table
ALTER TABLE approvals ADD COLUMN googleCalendarEventId TEXT;
ALTER TABLE approvals ADD COLUMN calendarCreatedAt TEXT;
ALTER TABLE approvals ADD COLUMN calendarError TEXT;
```

## User Flow

### First-Time Setup
1. Open Settings (macOS or iOS app)
2. Navigate to "Google Calendar" section
3. Click "Connect" button
4. Browser opens to Google OAuth consent screen
5. User signs in with Google account
6. User grants calendar permissions
7. Redirect back to success page
8. Connection status shows "Connected"

### Automatic Calendar Creation
1. User approves an event flyer
2. Approval status → "approved"
3. Calendar creation job enqueued (Bull queue)
4. Worker fetches event details from approval/asset
5. Worker calls Google Calendar API
6. Event created in user's primary calendar
7. Event ID stored in approval record
8. User receives confirmation

### Event Details
Calendar events include:
- **Summary**: Event name
- **Date/Time**: Parsed from extracted data (or all-day if ambiguous)
- **Location**: Venue + city (if available)
- **Description**: Event description + canonical URL + "Added by Photos Agent"
- **Reminders**: Default calendar reminders

## API Endpoints

### OAuth Flow
- `GET /api/oauth/google/authorize` - Start OAuth flow (redirects to Google)
- `GET /api/oauth/google/callback` - OAuth callback (receives code, exchanges for tokens)
- `GET /api/oauth/google/status` - Check if calendar is connected
- `POST /api/oauth/google/disconnect` - Remove calendar connection

### Response Examples

**Status Check:**
```json
{
  "success": true,
  "connected": true,
  "connectedAt": "2026-02-01T10:30:00Z"
}
```

**Disconnect:**
```json
{
  "success": true,
  "message": "Google Calendar disconnected successfully"
}
```

## Worker Queue

### Calendar Creation Worker
- Queue name: `calendar-creation`
- Concurrency: 1 (processes one at a time)
- Retry strategy: 3 attempts with exponential backoff
- Triggered by: Approval status change to "approved"

### Job Data
```typescript
{
  approvalId: string  // ID of approval to process
}
```

### Worker Logic
1. Check if Google Calendar connected
2. Fetch approval + asset with event details
3. Check if calendar event already created (skip if exists)
4. Parse event details (JSON from extractedData or eventDetails)
5. Call Google Calendar API to create event
6. Update approval with eventId or error
7. Return success/failure

## Features

### Duplicate Detection
Before creating an event, the system searches for existing events on the same day with a similar name:
- Queries Google Calendar for events on target date
- Fuzzy matches event names (case-insensitive, partial matches)
- If duplicate found, skips creation and returns existing event ID

### Token Refresh
Access tokens expire after 1 hour. The system automatically refreshes tokens:
- Checks token expiry before each API call
- Refreshes if expired or expiring in next 5 minutes
- Updates stored tokens in database
- Uses refresh token (never expires) for renewal

### All-Day Events
When time is ambiguous or missing:
- Creates all-day event instead of timed event
- Uses `{ date: "2026-02-15" }` format instead of `{ dateTime: "..." }`
- Timezone not relevant for all-day events

### Error Handling
- Connection errors: Stored in `calendarError` field
- Approval not blocked if calendar fails
- User can retry later or disconnect/reconnect
- Errors visible in Bull Board UI

## Testing

### Manual Testing Steps
1. Set up Google OAuth credentials (see above)
2. Add credentials to `.env` file
3. Restart server: `npm run dev`
4. Open macOS app → Settings
5. Click "Connect" in Google Calendar section
6. Complete OAuth flow
7. Upload an event flyer image
8. Wait for intent classification → approval created
9. Approve the event
10. Check Google Calendar → event should appear
11. Check Bull Board (`http://localhost:1738/admin/queues`) → see calendar-creation job

### Validation
- ✅ OAuth flow completes successfully
- ✅ Tokens stored in database
- ✅ Connection status shows "Connected"
- ✅ Approval → calendar creation job enqueued
- ✅ Event appears in Google Calendar
- ✅ Event ID stored in approval record
- ✅ Duplicate detection works (try approving same event twice)
- ✅ All-day events created for ambiguous times

## Troubleshooting

### "Google Calendar not connected"
- Check if OAuth flow completed successfully
- Verify tokens exist in database: `SELECT * FROM oauth_tokens WHERE provider = 'google'`
- Try disconnecting and reconnecting

### "Failed to create calendar event"
- Check Google Calendar API is enabled in console
- Verify API quotas not exceeded
- Check server logs for detailed error
- Inspect `calendarError` field in approvals table

### "Invalid grant" error
- Refresh token may be invalid
- Disconnect and reconnect calendar
- Ensure OAuth consent screen is published (not testing mode)

### Token refresh failures
- Check refresh token exists in database
- Verify client secret hasn't changed
- Review Google Cloud Console for API errors

## Security Notes

- Tokens stored in SQLite database (server-side only)
- Refresh tokens never expire unless revoked by user
- OAuth uses PKCE flow for additional security
- Redirect URI validated by Google
- Only requested scopes granted (calendar.events + calendar.readonly)

## Future Enhancements

- [ ] Support multiple calendars (let user choose)
- [ ] Custom event colors
- [ ] Custom reminders (1 day before, 1 hour before)
- [ ] Sync attendees from RSVP list
- [ ] Handle recurring events
- [ ] Calendar event updates (if flyer details change)
