import { Job } from 'bull';
import { db } from '../db/sqlite';
import { createCalendarEvent, isCalendarConnected, CalendarEventDetails } from '../services/google-calendar';
import { calendarQueue } from '../services/queue';

/**
 * Job data for calendar creation
 */
interface CalendarJobData {
  approvalId: string;
}

/**
 * Process calendar creation jobs
 */
calendarQueue.process(async (job: Job<CalendarJobData>) => {
  const { approvalId } = job.data;

  console.log(`\n📅 Processing calendar creation for approval: ${approvalId}`);

  try {
    // Check if Google Calendar is connected
    if (!isCalendarConnected()) {
      console.log('⚠️  Google Calendar not connected - skipping calendar creation');
      
      // Update approval with error
      db.prepare(`
        UPDATE approvals 
        SET calendarError = ?, updatedAt = datetime('now')
        WHERE id = ?
      `).run('Google Calendar not connected', approvalId);

      return {
        success: false,
        error: 'Google Calendar not connected'
      };
    }

    // Get approval and asset details
    const approval = db.prepare(`
      SELECT a.id, a.extractedData, a.assetId, a.googleCalendarEventId,
             ast.eventDetails
      FROM approvals a
      LEFT JOIN assets ast ON a.assetId = ast.id
      WHERE a.id = ?
    `).get(approvalId) as {
      id: string;
      extractedData: string;
      assetId: string;
      googleCalendarEventId: string | null;
      eventDetails: string | null;
    } | undefined;

    if (!approval) {
      console.error('❌ Approval not found:', approvalId);
      throw new Error('Approval not found');
    }

    // Skip if calendar event already created
    if (approval.googleCalendarEventId) {
      console.log('⚠️  Calendar event already exists:', approval.googleCalendarEventId);
      return {
        success: true,
        eventId: approval.googleCalendarEventId,
        message: 'Calendar event already exists'
      };
    }

    // Parse event details
    let eventDetails: CalendarEventDetails;

    // Try extractedData first (from approval), fallback to eventDetails (from asset)
    const dataSource = approval.extractedData || approval.eventDetails;
    
    if (!dataSource) {
      console.error('❌ No event details found for approval:', approvalId);
      throw new Error('No event details available');
    }

    try {
      const parsedData = JSON.parse(dataSource);
      
      // Map to CalendarEventDetails format
      eventDetails = {
        eventName: parsedData.eventName || parsedData.name || 'Untitled Event',
        date: parsedData.date || parsedData.startDate || new Date().toISOString(),
        time: parsedData.time || parsedData.startTime,
        location: parsedData.location,
        venue: parsedData.venue,
        description: parsedData.description,
        url: parsedData.url || parsedData.eventUrl
      };
    } catch (error: any) {
      console.error('❌ Failed to parse event details:', error.message);
      throw new Error('Invalid event details format');
    }

    console.log('📋 Event details:', eventDetails);

    // Create calendar event
    const result = await createCalendarEvent(eventDetails);

    if (result.success) {
      console.log(`✅ Calendar event created: ${result.eventId}`);

      // Update approval with calendar event ID
      db.prepare(`
        UPDATE approvals 
        SET googleCalendarEventId = ?, 
            calendarCreatedAt = datetime('now'),
            calendarError = NULL,
            updatedAt = datetime('now')
        WHERE id = ?
      `).run(result.eventId, approvalId);

      return {
        success: true,
        eventId: result.eventId,
        eventUrl: result.eventUrl
      };

    } else {
      console.error('❌ Failed to create calendar event:', result.error);

      // Update approval with error
      db.prepare(`
        UPDATE approvals 
        SET calendarError = ?, updatedAt = datetime('now')
        WHERE id = ?
      `).run(result.error || 'Unknown error', approvalId);

      throw new Error(result.error || 'Failed to create calendar event');
    }

  } catch (error: any) {
    console.error('❌ Calendar creation failed:', error.message);

    // Update approval with error
    try {
      db.prepare(`
        UPDATE approvals 
        SET calendarError = ?, updatedAt = datetime('now')
        WHERE id = ?
      `).run(error.message, approvalId);
    } catch (dbError: any) {
      console.error('❌ Failed to update approval with error:', dbError.message);
    }

    throw error;
  }
});

console.log('✅ Calendar creation worker started');

export default calendarQueue;
