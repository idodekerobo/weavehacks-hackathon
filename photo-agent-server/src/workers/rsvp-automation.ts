import { rsvpQueue } from '../services/queue';
import { db } from '../db/sqlite';
import { executeRSVP, RSVPResult } from '../services/rsvp-agent';
import { logAttributes } from '../services/weave';
import { calendarQueue } from '../services/queue';

interface RSVPJob {
  assetId: string;
  approvalId: string;
  eventUrl: string;
  eventName: string;
  eventDate?: string;
  eventLocation?: string;
}

rsvpQueue.process(1, async (job) => { // 1 concurrent (Browserbase sessions)
  const { assetId, approvalId, eventUrl, eventName, eventDate, eventLocation } = job.data as RSVPJob;

  console.log('\n' + '='.repeat(60));
  console.log('🤖 RSVP AUTOMATION WORKER');
  console.log('='.repeat(60));
  console.log(`📋 Approval ID: ${approvalId}`);
  console.log(`🖼️  Asset ID: ${assetId}`);
  console.log(`🎫 Event: ${eventName}`);
  console.log(`🔗 URL: ${eventUrl}`);
  console.log(`📅 Date: ${eventDate || 'N/A'}`);
  console.log(`📍 Location: ${eventLocation || 'N/A'}`);
  console.log('='.repeat(60) + '\n');

  logAttributes({
    operation: 'rsvp_worker',
    assetId,
    approvalId,
    eventUrl,
    eventName
  });

  // Update approval status to in_progress
  db.prepare(`
    UPDATE approvals
    SET rsvpStatus = 'in_progress', updatedAt = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(approvalId);

  try {
    // Execute RSVP automation
    const result: RSVPResult = await executeRSVP(eventUrl, eventName, assetId);

    console.log('\n' + '-'.repeat(40));
    console.log('📊 RSVP RESULT');
    console.log('-'.repeat(40));
    console.log(`Success: ${result.success}`);
    console.log(`Steps completed: ${result.steps.length}`);
    if (result.confirmationNumber) {
      console.log(`Confirmation: ${result.confirmationNumber}`);
    }
    if (result.error) {
      console.log(`Error: ${result.error}`);
    }
    if (result.requiresPayment) {
      console.log(`Payment required: ${result.paymentAmount}`);
    }
    console.log(`Session: ${result.sessionId}`);
    console.log(`Recording: ${result.recordingUrl}`);
    console.log('-'.repeat(40) + '\n');

    if (result.success) {
      // Update approval with success
      db.prepare(`
        UPDATE approvals
        SET 
          rsvpStatus = 'completed',
          rsvpSessionId = ?,
          rsvpRecordingUrl = ?,
          confirmationNumber = ?,
          confirmationScreenshot = ?,
          updatedAt = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        result.sessionId,
        result.recordingUrl,
        result.confirmationNumber,
        result.confirmationScreenshotPath,
        approvalId
      );

      console.log('✅ RSVP completed successfully!');
      
      // Now trigger calendar creation
      console.log('📅 Enqueueing calendar creation...');
      await calendarQueue.add({
        approvalId,
        assetId,
        eventName,
        eventDate,
        eventLocation,
        eventUrl
      });

      logAttributes({
        outcome: 'success',
        confirmationNumber: result.confirmationNumber,
        rsvpSessionId: result.sessionId
      });

    } else if (result.requiresPayment) {
      // Update approval with payment requirement
      db.prepare(`
        UPDATE approvals
        SET 
          rsvpStatus = 'payment_required',
          rsvpSessionId = ?,
          rsvpRecordingUrl = ?,
          proposedAction = ?,
          updatedAt = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        result.sessionId,
        result.recordingUrl,
        JSON.stringify({
          action: 'manual_payment',
          description: `This event requires payment: ${result.paymentAmount}. Please complete registration manually.`,
          eventUrl,
          paymentAmount: result.paymentAmount
        }),
        approvalId
      );

      console.log(`⚠️ Payment required: ${result.paymentAmount}`);

      logAttributes({
        outcome: 'payment_required',
        paymentAmount: result.paymentAmount
      });

    } else {
      // Update approval with failure
      db.prepare(`
        UPDATE approvals
        SET 
          rsvpStatus = 'failed',
          rsvpSessionId = ?,
          rsvpRecordingUrl = ?,
          proposedAction = ?,
          updatedAt = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        result.sessionId,
        result.recordingUrl,
        JSON.stringify({
          action: 'manual_rsvp',
          description: `Automated RSVP failed: ${result.error}. Please complete registration manually.`,
          eventUrl,
          error: result.error,
          steps: result.steps
        }),
        approvalId
      );

      console.log(`❌ RSVP failed: ${result.error}`);

      logAttributes({
        outcome: 'failed',
        error: result.error
      });
    }

    return {
      success: result.success,
      approvalId,
      eventName,
      confirmationNumber: result.confirmationNumber,
      error: result.error,
      requiresPayment: result.requiresPayment
    };

  } catch (error: any) {
    console.error('❌ RSVP worker error:', error.message);
    console.error('Stack:', error.stack);

    // Update approval with error
    db.prepare(`
      UPDATE approvals
      SET 
        rsvpStatus = 'failed',
        proposedAction = ?,
        updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      JSON.stringify({
        action: 'manual_rsvp',
        description: `RSVP automation error: ${error.message}`,
        eventUrl,
        error: error.message
      }),
      approvalId
    );

    logAttributes({
      outcome: 'error',
      error: error.message
    });

    throw error;
  }
});

console.log('✅ RSVP automation worker started (concurrency: 1)');
