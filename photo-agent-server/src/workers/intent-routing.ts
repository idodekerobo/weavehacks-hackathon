import { intentRoutingQueue } from '../services/queue';
import { db } from '../db/sqlite';
import { classifyIntent } from '../services/ollama';
import { logAttributes } from '../services/weave';
import crypto from 'crypto';

intentRoutingQueue.process(2, async (job) => { // 2 concurrent
  const { assetId } = job.data;

  logAttributes({
    operation: 'intent_routing',
    assetId
  });

  // Fetch asset analysis results from database
  const asset = db.prepare(`
    SELECT summary, ocrText, deviceId
    FROM assets
    WHERE id = ?
  `).get(assetId) as { summary: string; ocrText: string; deviceId: string } | undefined;

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
    // Create approval for event flyer
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
        reasoning: classification.reasoning
      }),
      JSON.stringify({
        action: 'rsvp_and_calendar',
        description: 'Find event online, RSVP, and add to calendar'
      }),
      classification.confidence,
      'pending'
    );
    
    console.log(`✅ Created approval ${approvalId} for asset ${assetId} (event flyer detected)`);
    
    logAttributes({
      routingDecision: 'approval_created',
      intentType: classification.intentType,
      confidence: classification.confidence,
      approvalId
    });
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
