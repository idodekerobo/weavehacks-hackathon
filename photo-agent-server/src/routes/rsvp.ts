import express from 'express';
import { db } from '../db/sqlite';
import { rsvpQueue } from '../services/queue';
import { getUserData } from '../services/rsvp-agent';

const router = express.Router();

/**
 * GET /api/rsvp/user
 * Get hardcoded user data for RSVP forms
 */
router.get('/user', (req, res) => {
  const userData = getUserData();
  res.json({
    success: true,
    user: userData
  });
});

/**
 * POST /api/rsvp/start
 * Start RSVP automation for an asset
 * Body: { assetId: string }
 */
router.post('/start', async (req, res) => {
  try {
    const { assetId } = req.body;

    if (!assetId) {
      return res.status(400).json({ error: 'assetId is required' });
    }

    console.log('\n🚀 RSVP START REQUEST');
    console.log(`Asset ID: ${assetId}`);

    // Fetch asset and check if it has event details
    const asset = db.prepare(`
      SELECT id, eventDetails, canonicalUrl, verifiedDetails, intentLabels, summary
      FROM assets
      WHERE id = ?
    `).get(assetId) as {
      id: string;
      eventDetails: string | null;
      canonicalUrl: string | null;
      verifiedDetails: string | null;
      intentLabels: string | null;
      summary: string | null;
    } | undefined;

    if (!asset) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    console.log('📋 Asset found:', asset.id);
    console.log('📋 Has event details:', !!asset.eventDetails);
    console.log('📋 Has canonical URL:', !!asset.canonicalUrl);

    // Parse event details
    let eventDetails: any = null;
    let eventUrl: string | null = null;
    let eventName = 'Unknown Event';
    let eventDate: string | undefined;
    let eventLocation: string | undefined;

    if (asset.eventDetails) {
      try {
        eventDetails = JSON.parse(asset.eventDetails);
        eventName = eventDetails.eventName || 'Unknown Event';
        eventDate = eventDetails.date;
        eventLocation = eventDetails.location || eventDetails.venue;
        eventUrl = eventDetails.url;
        console.log('📋 Parsed event details:', eventDetails);
      } catch (e) {
        console.log('⚠️ Failed to parse event details');
      }
    }

    // Use canonical URL if available (from web search)
    if (asset.canonicalUrl) {
      eventUrl = asset.canonicalUrl;
      console.log('📋 Using canonical URL:', eventUrl);
    }

    // Try to get event name from verified details
    if (asset.verifiedDetails) {
      try {
        const verified = JSON.parse(asset.verifiedDetails);
        if (verified.title) {
          eventName = verified.title;
        }
      } catch (e) {
        // ignore
      }
    }

    if (!eventUrl) {
      return res.status(400).json({ 
        error: 'No event URL found. This asset needs web search first.',
        suggestion: 'The asset needs to be processed through the event search pipeline first.'
      });
    }

    // Check for existing approval or create new one
    let approval = db.prepare(`
      SELECT id, status, rsvpStatus
      FROM approvals
      WHERE assetId = ?
      ORDER BY createdAt DESC
      LIMIT 1
    `).get(assetId) as { id: string; status: string; rsvpStatus: string | null } | undefined;

    let approvalId: string;

    if (approval) {
      approvalId = approval.id;
      console.log(`📋 Using existing approval: ${approvalId}`);
      
      // Check if RSVP is already in progress or completed
      if (approval.rsvpStatus === 'in_progress') {
        return res.status(409).json({
          error: 'RSVP is already in progress',
          approvalId
        });
      }
      
      if (approval.rsvpStatus === 'completed') {
        return res.status(409).json({
          error: 'RSVP already completed',
          approvalId
        });
      }
    } else {
      // Create new approval for this RSVP
      approvalId = crypto.randomUUID();
      const deviceId = req.body.deviceId || 'unknown';
      
      db.prepare(`
        INSERT INTO approvals (
          id, assetId, deviceId, intentType, extractedData, proposedAction, confidence, status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        approvalId,
        assetId,
        deviceId,
        'event_flyer',
        JSON.stringify({ eventDetails }),
        JSON.stringify({
          action: 'rsvp_automation',
          description: `RSVP to "${eventName}"`,
          eventUrl
        }),
        0.9,
        'approved' // Auto-approve for RSVP flow
      );
      
      console.log(`📋 Created new approval: ${approvalId}`);
    }

    // Enqueue RSVP job
    const job = await rsvpQueue.add({
      assetId,
      approvalId,
      eventUrl,
      eventName,
      eventDate,
      eventLocation
    });

    console.log(`✅ RSVP job enqueued: ${job.id}`);

    res.json({
      success: true,
      message: 'RSVP automation started',
      jobId: job.id,
      approvalId,
      eventUrl,
      eventName
    });

  } catch (error: any) {
    console.error('❌ RSVP start error:', error.message);
    res.status(500).json({ error: 'Failed to start RSVP automation', details: error.message });
  }
});

/**
 * GET /api/rsvp/status/:approvalId
 * Get RSVP status for an approval
 */
router.get('/status/:approvalId', (req, res) => {
  try {
    const { approvalId } = req.params;

    const approval = db.prepare(`
      SELECT 
        id, assetId, status, rsvpStatus, rsvpSessionId, rsvpRecordingUrl,
        confirmationNumber, confirmationScreenshot, proposedAction, updatedAt
      FROM approvals
      WHERE id = ?
    `).get(approvalId) as any;

    if (!approval) {
      return res.status(404).json({ error: 'Approval not found' });
    }

    // Parse proposed action for any error messages
    let proposedAction: any = null;
    if (approval.proposedAction) {
      try {
        proposedAction = JSON.parse(approval.proposedAction);
      } catch (e) {
        // ignore
      }
    }

    res.json({
      success: true,
      approval: {
        id: approval.id,
        assetId: approval.assetId,
        status: approval.status,
        rsvpStatus: approval.rsvpStatus,
        sessionId: approval.rsvpSessionId,
        recordingUrl: approval.rsvpRecordingUrl,
        confirmationNumber: approval.confirmationNumber,
        confirmationScreenshot: approval.confirmationScreenshot,
        error: proposedAction?.error,
        updatedAt: approval.updatedAt
      }
    });

  } catch (error: any) {
    console.error('❌ RSVP status error:', error.message);
    res.status(500).json({ error: 'Failed to get RSVP status' });
  }
});

/**
 * GET /api/rsvp/assets
 * Get assets that are eligible for RSVP (event flyers with URLs)
 */
router.get('/assets', (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;

    // Get assets that have event details or canonical URLs
    const assets = db.prepare(`
      SELECT 
        a.id, a.photoLibraryId, a.filename, a.summary, a.intentLabels,
        a.eventDetails, a.canonicalUrl, a.creationDate,
        ap.id as approvalId, ap.rsvpStatus, ap.confirmationNumber
      FROM assets a
      LEFT JOIN approvals ap ON ap.assetId = a.id
      WHERE a.eventDetails IS NOT NULL OR a.canonicalUrl IS NOT NULL
      ORDER BY a.creationDate DESC
      LIMIT ?
    `).all(limit) as any[];

    // Transform results
    const results = assets.map(asset => {
      let eventDetails: any = null;
      let eventName = 'Unknown Event';
      let eventUrl: string | null = asset.canonicalUrl;

      if (asset.eventDetails) {
        try {
          eventDetails = JSON.parse(asset.eventDetails);
          eventName = eventDetails.eventName || 'Unknown Event';
          if (!eventUrl && eventDetails.url) {
            eventUrl = eventDetails.url;
          }
        } catch (e) {
          // ignore
        }
      }

      return {
        id: asset.id,
        photoLibraryId: asset.photoLibraryId,
        filename: asset.filename,
        summary: asset.summary,
        eventName,
        eventUrl,
        eventDate: eventDetails?.date,
        eventLocation: eventDetails?.location || eventDetails?.venue,
        creationDate: asset.creationDate,
        approvalId: asset.approvalId,
        rsvpStatus: asset.rsvpStatus,
        confirmationNumber: asset.confirmationNumber,
        canRSVP: !!eventUrl && asset.rsvpStatus !== 'completed' && asset.rsvpStatus !== 'in_progress'
      };
    });

    res.json({
      success: true,
      assets: results,
      total: results.length
    });

  } catch (error: any) {
    console.error('❌ Get RSVP assets error:', error.message);
    res.status(500).json({ error: 'Failed to get RSVP assets' });
  }
});

/**
 * POST /api/rsvp/test
 * Test RSVP with a direct URL (for development)
 * Body: { eventUrl: string, eventName?: string }
 */
router.post('/test', async (req, res) => {
  try {
    const { eventUrl, eventName = 'Test Event' } = req.body;

    if (!eventUrl) {
      return res.status(400).json({ error: 'eventUrl is required' });
    }

    console.log('\n🧪 RSVP TEST REQUEST');
    console.log(`URL: ${eventUrl}`);
    console.log(`Name: ${eventName}`);

    // Create a test approval
    const approvalId = crypto.randomUUID();
    const assetId = `test-${Date.now()}`;
    
    db.prepare(`
      INSERT INTO approvals (
        id, assetId, deviceId, intentType, extractedData, proposedAction, confidence, status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      approvalId,
      assetId,
      'test-device',
      'event_flyer',
      JSON.stringify({ test: true, eventUrl, eventName }),
      JSON.stringify({
        action: 'rsvp_automation',
        description: `Test RSVP to "${eventName}"`,
        eventUrl
      }),
      1.0,
      'approved'
    );

    // Enqueue RSVP job
    const job = await rsvpQueue.add({
      assetId,
      approvalId,
      eventUrl,
      eventName
    });

    console.log(`✅ Test RSVP job enqueued: ${job.id}`);

    res.json({
      success: true,
      message: 'Test RSVP automation started',
      jobId: job.id,
      approvalId,
      eventUrl,
      eventName
    });

  } catch (error: any) {
    console.error('❌ Test RSVP error:', error.message);
    res.status(500).json({ error: 'Failed to start test RSVP', details: error.message });
  }
});

export default router;
