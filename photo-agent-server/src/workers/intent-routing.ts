import { intentRoutingQueue, eventSearchQueue } from '../services/queue';
import { db } from '../db/sqlite';
import { classifyIntent } from '../services/ollama';
import { extractEventDetails } from '../services/event-extraction';
import { logAttributes } from '../services/weave';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

intentRoutingQueue.process(2, async (job) => { // 2 concurrent
  const { assetId } = job.data;

  logAttributes({
    operation: 'intent_routing',
    assetId
  });

  // Fetch asset analysis results from database
  const asset = db.prepare(`
    SELECT summary, ocrText, deviceId, imageData
    FROM assets
    WHERE id = ?
  `).get(assetId) as { summary: string; ocrText: string; deviceId: string; imageData: Buffer } | undefined;

  if (!asset) {
    throw new Error(`Asset not found: ${assetId}`);
  }

  // Classify intent
  const classification = await classifyIntent(asset.summary, asset.ocrText);

  // Update database with intent classification
  db.prepare(`
    UPDATE assets
    SET intentLabels = ?, confidence = ?, updatedAt = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    JSON.stringify([classification.intentType]),
    classification.confidence,
    assetId
  );

  console.log(`✅ Classified intent for asset ${assetId}: ${classification.intentType} (confidence: ${classification.confidence})`);

  // Route based on intent type
  if (classification.intentType === 'event_flyer' && classification.confidence >= 0.7) {
    // Extract event details for high-confidence event flyers
    console.log(`🎟️  Extracting event details from asset ${assetId}...`);
    
    const extractionResult = await extractEventDetails(asset.imageData);
    
    if (extractionResult.success && extractionResult.event) {
      const event = extractionResult.event;
      
      // Store extracted event details
      db.prepare(`
        UPDATE assets
        SET eventDetails = ?, updatedAt = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        JSON.stringify(event),
        assetId
      );
      
      console.log(`✅ Extracted event: "${event.eventName}" on ${event.date} in ${event.location}`);
      
      // Queue web search job (Milestone K)
      await eventSearchQueue.add({
        assetId,
        extractedEvent: event
      }, {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000
        }
      });
      
      console.log(`🔍 Queued web search for event: ${event.eventName}`);
      
      logAttributes({
        routingDecision: 'event_extraction_success',
        intentType: classification.intentType,
        eventName: event.eventName,
        eventConfidence: event.confidence,
        hasUrl: !!event.url,
        queuedWebSearch: true
      });
    } else {
      // Extraction failed - still create approval but without structured event data
      console.log(`⚠️  Event extraction failed: ${extractionResult.error}`);
      
      const approvalId = crypto.randomUUID();
      
      db.prepare(`
        INSERT INTO approvals (id, assetId, deviceId, intentType, extractedData, proposedAction, confidence, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        approvalId,
        assetId,
        asset.deviceId,
        classification.intentType,
        JSON.stringify({
          summary: asset.summary,
          ocrText: asset.ocrText,
          reasoning: classification.reasoning,
          extractionError: extractionResult.error
        }),
        JSON.stringify({
          action: 'manual_review',
          description: 'Event flyer detected but could not extract details - needs manual review'
        }),
        classification.confidence,
        'pending'
      );
      
      console.log(`📋 Created manual review approval ${approvalId} for asset ${assetId}`);
      
      logAttributes({
        routingDecision: 'event_extraction_failed',
        intentType: classification.intentType,
        extractionError: extractionResult.error,
        approvalId
      });
    }
  } else {
    console.log(`📋 Asset ${assetId} classified as ${classification.intentType} - no automated actions`);
    
    logAttributes({
      routingDecision: 'no_action',
      intentType: classification.intentType,
      confidence: classification.confidence
    });
  }

  return {
    assetId,
    intentType: classification.intentType,
    confidence: classification.confidence,
    reasoning: classification.reasoning
  };
});

console.log('✅ Intent routing worker started (concurrency: 2)');
