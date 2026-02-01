import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { db } from '../db/sqlite';
import { createTracedOp, logAttributes } from './weave';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:1738/api/oauth/google/callback';

// OAuth scopes needed for calendar access
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly'
];

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
  console.warn('⚠️  Google Calendar credentials not configured - calendar integration will be disabled');
}

/**
 * Event details for calendar creation
 */
export interface CalendarEventDetails {
  eventName: string;
  date: string;        // ISO date string or date-time
  time?: string;       // Optional time
  location?: string;
  venue?: string;
  description?: string;
  url?: string;
}

/**
 * Result from calendar event creation
 */
export interface CalendarEventResult {
  success: boolean;
  eventId?: string;
  eventUrl?: string;
  error?: string;
}

/**
 * Initialize OAuth2 client
 */
function getOAuth2Client(): OAuth2Client {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new Error('Google Calendar credentials not configured');
  }

  return new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    REDIRECT_URI
  );
}

/**
 * Generate OAuth authorization URL
 */
export function getAuthorizationUrl(): string {
  const oauth2Client = getOAuth2Client();
  
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent' // Force consent screen to get refresh token
  });
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(code: string): Promise<void> {
  const oauth2Client = getOAuth2Client();
  
  try {
    const { tokens } = await oauth2Client.getToken(code);
    
    if (!tokens.access_token || !tokens.refresh_token) {
      throw new Error('Missing tokens in OAuth response');
    }

    // Store tokens in database
    const expiresAt = tokens.expiry_date 
      ? new Date(tokens.expiry_date).toISOString()
      : null;

    db.prepare(`
      INSERT INTO oauth_tokens (id, provider, accessToken, refreshToken, tokenType, expiresAt, scope, connectedAt, updatedAt)
      VALUES (1, 'google', ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        accessToken = excluded.accessToken,
        refreshToken = excluded.refreshToken,
        tokenType = excluded.tokenType,
        expiresAt = excluded.expiresAt,
        scope = excluded.scope,
        updatedAt = datetime('now')
    `).run(
      tokens.access_token,
      tokens.refresh_token,
      tokens.token_type || 'Bearer',
      expiresAt,
      SCOPES.join(' ')
    );

    console.log('✅ Google Calendar tokens stored successfully');

    logAttributes({
      operation: 'oauth_token_exchange',
      provider: 'google',
      success: true
    });

  } catch (error: any) {
    console.error('❌ Failed to exchange authorization code:', error.message);
    logAttributes({
      operation: 'oauth_token_exchange',
      provider: 'google',
      success: false,
      error: error.message
    });
    throw error;
  }
}

/**
 * Get authenticated OAuth2 client with automatic token refresh
 */
async function getAuthenticatedClient(): Promise<OAuth2Client> {
  const oauth2Client = getOAuth2Client();

  // Get tokens from database
  const tokenRow = db.prepare(`
    SELECT accessToken, refreshToken, expiresAt 
    FROM oauth_tokens 
    WHERE provider = 'google' AND id = 1
  `).get() as { accessToken: string; refreshToken: string; expiresAt: string | null } | undefined;

  if (!tokenRow) {
    throw new Error('Google Calendar not connected. Please authorize access first.');
  }

  // Set credentials
  oauth2Client.setCredentials({
    access_token: tokenRow.accessToken,
    refresh_token: tokenRow.refreshToken,
    expiry_date: tokenRow.expiresAt ? new Date(tokenRow.expiresAt).getTime() : undefined
  });

  // Check if token needs refresh
  if (tokenRow.expiresAt) {
    const expiresAt = new Date(tokenRow.expiresAt);
    const now = new Date();
    const fiveMinutes = 5 * 60 * 1000;

    // Refresh if expired or expiring in next 5 minutes
    if (expiresAt.getTime() - now.getTime() < fiveMinutes) {
      console.log('🔄 Refreshing Google Calendar access token...');
      
      try {
        const { credentials } = await oauth2Client.refreshAccessToken();
        
        // Update tokens in database
        const newExpiresAt = credentials.expiry_date 
          ? new Date(credentials.expiry_date).toISOString()
          : null;

        db.prepare(`
          UPDATE oauth_tokens 
          SET accessToken = ?, expiresAt = ?, updatedAt = datetime('now')
          WHERE provider = 'google' AND id = 1
        `).run(credentials.access_token, newExpiresAt);

        console.log('✅ Access token refreshed');
      } catch (error: any) {
        console.error('❌ Failed to refresh token:', error.message);
        throw new Error('Failed to refresh Google Calendar access token');
      }
    }
  }

  return oauth2Client;
}

/**
 * Check if Google Calendar is connected
 */
export function isCalendarConnected(): boolean {
  const tokenRow = db.prepare(`
    SELECT id FROM oauth_tokens WHERE provider = 'google' AND id = 1
  `).get();

  return !!tokenRow;
}

/**
 * Get OAuth connection status
 */
export function getConnectionStatus(): { connected: boolean; connectedAt?: string } {
  const tokenRow = db.prepare(`
    SELECT connectedAt FROM oauth_tokens WHERE provider = 'google' AND id = 1
  `).get() as { connectedAt: string } | undefined;

  return {
    connected: !!tokenRow,
    connectedAt: tokenRow?.connectedAt
  };
}

/**
 * Search for duplicate events in calendar
 */
async function findDuplicateEvent(
  calendar: any,
  eventName: string,
  date: string
): Promise<string | null> {
  
  try {
    // Parse date to get date range for search
    const targetDate = new Date(date);
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    // Search for events on the same day with similar name
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: startOfDay.toISOString(),
      timeMax: endOfDay.toISOString(),
      q: eventName, // Search query
      singleEvents: true,
      orderBy: 'startTime'
    });

    const events = response.data.items || [];

    // Look for exact or fuzzy match on event name
    for (const event of events) {
      const existingName = event.summary?.toLowerCase() || '';
      const searchName = eventName.toLowerCase();

      // Check if names are very similar (fuzzy match)
      if (existingName === searchName || 
          existingName.includes(searchName) || 
          searchName.includes(existingName)) {
        console.log(`⚠️  Found potential duplicate event: ${event.summary} (${event.id})`);
        return event.id || null;
      }
    }

    return null;

  } catch (error: any) {
    console.error('⚠️  Failed to search for duplicate events:', error.message);
    return null; // Don't fail event creation if duplicate check fails
  }
}

/**
 * Parse event date and time into calendar format
 */
function parseEventDateTime(date: string, time?: string): { start: any; end: any } {
  
  try {
    // Try to parse as ISO date first
    let eventDate = new Date(date);

    // If invalid, try parsing common date formats
    if (isNaN(eventDate.getTime())) {
      // Try parsing formats like "March 15, 2026" or "3/15/2026"
      eventDate = new Date(date);
    }

    if (isNaN(eventDate.getTime())) {
      throw new Error('Invalid date format');
    }

    // If no time provided or time is ambiguous, create all-day event
    if (!time || time === 'TBD' || time === 'TBA' || time.toLowerCase().includes('ambiguous')) {
      return {
        start: { date: eventDate.toISOString().split('T')[0] },
        end: { date: eventDate.toISOString().split('T')[0] }
      };
    }

    // Parse time (formats like "7:00 PM", "19:00", "7pm")
    const timeMatch = time.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)?/i);
    
    if (timeMatch) {
      let hours = parseInt(timeMatch[1]);
      const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
      const meridiem = timeMatch[3]?.toLowerCase();

      // Convert to 24-hour format
      if (meridiem === 'pm' && hours < 12) {
        hours += 12;
      } else if (meridiem === 'am' && hours === 12) {
        hours = 0;
      }

      eventDate.setHours(hours, minutes, 0, 0);

      // End time is 1 hour later
      const endDate = new Date(eventDate);
      endDate.setHours(endDate.getHours() + 1);

      return {
        start: { dateTime: eventDate.toISOString(), timeZone: 'America/Los_Angeles' },
        end: { dateTime: endDate.toISOString(), timeZone: 'America/Los_Angeles' }
      };
    }

    // If time parsing fails, create all-day event
    return {
      start: { date: eventDate.toISOString().split('T')[0] },
      end: { date: eventDate.toISOString().split('T')[0] }
    };

  } catch (error: any) {
    console.error('⚠️  Failed to parse date/time, creating all-day event:', error.message);
    
    // Fallback: try to use date as-is or use today
    const fallbackDate = new Date();
    return {
      start: { date: fallbackDate.toISOString().split('T')[0] },
      end: { date: fallbackDate.toISOString().split('T')[0] }
    };
  }
}

/**
 * Create a calendar event
 */
const _createCalendarEventImpl = async (
  eventDetails: CalendarEventDetails
): Promise<CalendarEventResult> => {
  
  console.log('📅 Creating calendar event:', eventDetails.eventName);

  logAttributes({
    operation: 'create_calendar_event',
    eventName: eventDetails.eventName,
    hasTime: !!eventDetails.time,
    hasLocation: !!eventDetails.location
  });

  try {
    // Get authenticated client
    const auth = await getAuthenticatedClient();
    const calendar = google.calendar({ version: 'v3', auth });

    // Check for duplicate events
    const duplicateId = await findDuplicateEvent(
      calendar,
      eventDetails.eventName,
      eventDetails.date
    );

    if (duplicateId) {
      console.log('⚠️  Skipping - duplicate event already exists');
      
      logAttributes({
        outcome: 'duplicate_found',
        existingEventId: duplicateId
      });

      return {
        success: true,
        eventId: duplicateId,
        error: 'Event already exists in calendar'
      };
    }

    // Parse date and time
    const { start, end } = parseEventDateTime(eventDetails.date, eventDetails.time);

    // Build location string
    let locationStr = '';
    if (eventDetails.venue) {
      locationStr = eventDetails.venue;
      if (eventDetails.location) {
        locationStr += `, ${eventDetails.location}`;
      }
    } else if (eventDetails.location) {
      locationStr = eventDetails.location;
    }

    // Build description
    let descriptionStr = eventDetails.description || '';
    if (eventDetails.url) {
      descriptionStr += `\n\nEvent Page: ${eventDetails.url}`;
    }
    descriptionStr += '\n\n✨ Added automatically by Photos-as-Intent Agent';

    // Create event
    const event = {
      summary: eventDetails.eventName,
      location: locationStr || undefined,
      description: descriptionStr.trim() || undefined,
      start,
      end,
      reminders: {
        useDefault: true // Use default calendar reminders
      }
    };

    console.log('📤 Sending event to Google Calendar...');

    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event
    });

    const createdEvent = response.data;
    const eventUrl = createdEvent.htmlLink;

    console.log(`✅ Calendar event created: ${createdEvent.id}`);
    console.log(`   URL: ${eventUrl}`);

    logAttributes({
      outcome: 'success',
      eventId: createdEvent.id,
      eventUrl,
      isAllDay: !!start.date
    });

    return {
      success: true,
      eventId: createdEvent.id || undefined,
      eventUrl: eventUrl || undefined
    };

  } catch (error: any) {
    console.error('❌ Failed to create calendar event:', error.message);
    
    logAttributes({
      outcome: 'error',
      error: error.message,
      errorType: error.name || 'unknown'
    });

    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Create calendar event with Weave tracing
 */
export const createCalendarEvent = createTracedOp(
  'createCalendarEvent',
  _createCalendarEventImpl
);

/**
 * Disconnect Google Calendar (remove tokens)
 */
export function disconnectCalendar(): void {
  db.prepare(`DELETE FROM oauth_tokens WHERE provider = 'google' AND id = 1`).run();
  console.log('✅ Google Calendar disconnected');
}
