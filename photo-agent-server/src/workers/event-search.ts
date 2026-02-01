import { eventSearchQueue } from '../services/queue';
import { db } from '../db/sqlite';
import { searchForEvent } from '../services/browserbase';
import { logAttributes } from '../services/weave';
import { ExtractedEvent } from '../services/event-extraction';
import crypto from 'crypto';

interface EventSearchJob {
  assetId: string;
  extractedEvent: ExtractedEvent;
}

eventSearchQueue.process(1, async (job) => { // 1 concurrent (Browserbase sessions)
  const { assetId, extractedEvent } = job.data as EventSearchJob;

  logAttributes({
    operation: 'event_search_worker',
    assetId,
    eventName: extractedEvent.eventName
  });

  console.log(`\n🔍 Starting web search for event: ${extractedEvent.eventName}`);

  // Fetch image data from database
  const asset = db.prepare(`
    SELECT imageData, deviceId
    FROM assets
    WHERE id = ?
  `).get(assetId) as { imageData: Buffer; deviceId: string } | undefined;

  if (!asset) {
    throw new Error(`Asset not found: ${assetId}`);
  }

  try {
    // Search for event using Browserbase
    const searchResult = await searchForEvent(extractedEvent, asset.imageData);

    if (searchResult && searchResult.verified) {
      // Successfully found and verified event page
      console.log(`✅ Found canonical event page: ${searchResult.url}`);

      // Update asset with verified details
      db.prepare(`
        UPDATE assets
        SET 
          canonicalUrl = ?,
          verifiedDetails = ?,
          screenshotPath = ?,
          verificationConfidence = ?,
          updatedAt = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        searchResult.url,
        JSON.stringify(searchResult),
        searchResult.screenshotPath,
        searchResult.confidence,
        assetId
      );

      // Create approval for user to confirm and proceed
      const approvalId = crypto.randomUUID();
      
      db.prepare(`
        INSERT INTO approvals (
          id, assetId, deviceId, intentType, extractedData, proposedAction, confidence, status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        approvalId,
        assetId,
        asset.deviceId,
        'event_flyer',
        JSON.stringify({
          extractedEvent,
          searchResult: {
            url: searchResult.url,
            title: searchResult.title,
            screenshotPath: searchResult.screenshotPath,
            sessionId: searchResult.sessionId,
            recordingUrl: searchResult.recordingUrl
          }
        }),
        JSON.stringify({
          action: 'rsvp_and_calendar',
          description: `RSVP to "${extractedEvent.eventName}" and add to calendar`,
          eventUrl: searchResult.url
        }),
        searchResult.confidence,
        'pending'
      );

      console.log(`📋 Created approval ${approvalId} for verified event`);

      logAttributes({
        outcome: 'success',
        approvalId,
        canonicalUrl: searchResult.url,
        confidence: searchResult.confidence,
        recordingUrl: searchResult.recordingUrl
      });

    } else {
      // Could not find or verify event page
      console.log(`⚠️  Could not find matching event page for: ${extractedEvent.eventName}`);

      // Create approval for manual search
      const approvalId = crypto.randomUUID();
      
      db.prepare(`
        INSERT INTO approvals (
          id, assetId, deviceId, intentType, extractedData, proposedAction, confidence, status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        approvalId,
        assetId,
        asset.deviceId,
        'event_flyer',
        JSON.stringify({
          extractedEvent,
          searchResult: null,
          searchAttempted: true
        }),
        JSON.stringify({
          action: 'manual_search',
          description: 'Automated search did not find matching event - needs manual review',
          suggestedQuery: `${extractedEvent.eventName} ${extractedEvent.location} ${extractedEvent.date}`
        }),
        0.5,
        'pending'
      );

      console.log(`📋 Created manual search approval ${approvalId}`);

      logAttributes({
        outcome: 'not_found',
        approvalId,
        needsManualSearch: true
      });
    }

  } catch (error: any) {
    console.error(`❌ Event search failed for asset ${assetId}:`, error.message);

    // Create approval for error case
    const approvalId = crypto.randomUUID();
    
    db.prepare(`
      INSERT INTO approvals (
        id, assetId, deviceId, intentType, extractedData, proposedAction, confidence, status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      approvalId,
      assetId,
      asset.deviceId,
      'event_flyer',
      JSON.stringify({
        extractedEvent,
        searchError: error.message
      }),
      JSON.stringify({
        action: 'manual_search',
        description: `Search failed: ${error.message}`,
        suggestedQuery: `${extractedEvent.eventName} ${extractedEvent.location}`
      }),
      0.3,
      'pending'
    );

    logAttributes({
      outcome: 'error',
      error: error.message,
      approvalId
    });

    // Don't throw - create approval instead
  }

  return {
    assetId,
    eventName: extractedEvent.eventName,
    success: true
  };
});

console.log('✅ Event search worker started (concurrency: 1)');
