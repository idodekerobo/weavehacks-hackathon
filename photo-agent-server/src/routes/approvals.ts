import express from 'express';
import { db } from '../db/sqlite';
import { calendarQueue } from '../services/queue';

const router = express.Router();

// Get all approvals
router.get('/', async (req, res) => {
  try {
    const status = req.query.status as string | undefined;
    const deviceId = req.query.deviceId as string | undefined;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    let query = `
      SELECT a.*, 
             ast.filename, ast.creationDate, ast.ocrText, ast.summary
      FROM approvals a
      LEFT JOIN assets ast ON a.assetId = ast.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (status) {
      query += ' AND a.status = ?';
      params.push(status);
    }

    if (deviceId) {
      query += ' AND a.deviceId = ?';
      params.push(deviceId);
    }

    query += ' ORDER BY a.createdAt DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const approvals = db.prepare(query).all(...params);
    const total = (db.prepare('SELECT COUNT(*) as count FROM approvals').get() as { count: number }).count;

    res.json({ success: true, approvals, total, limit, offset });
  } catch (error) {
    console.error('Get approvals error:', error);
    res.status(500).json({ error: 'Failed to retrieve approvals' });
  }
});

// Get single approval
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const approval = db.prepare(`
      SELECT a.*, 
             ast.filename, ast.creationDate, ast.ocrText, ast.summary, ast.contentHash
      FROM approvals a
      LEFT JOIN assets ast ON a.assetId = ast.id
      WHERE a.id = ?
    `).get(id);

    if (!approval) {
      return res.status(404).json({ error: 'Approval not found' });
    }

    res.json({ success: true, approval });
  } catch (error) {
    console.error('Get approval error:', error);
    res.status(500).json({ error: 'Failed to retrieve approval' });
  }
});

// Update approval status (approve/reject)
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, editedData } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Status must be approved or rejected' });
    }

    const updateData: any = {
      status,
      updatedAt: new Date().toISOString()
    };

    if (status === 'approved') {
      updateData.approvedAt = new Date().toISOString();
    } else {
      updateData.rejectedAt = new Date().toISOString();
    }

    if (editedData) {
      updateData.editedData = JSON.stringify(editedData);
    }

    db.prepare(`
      UPDATE approvals
      SET status = ?, editedData = ?, approvedAt = ?, rejectedAt = ?, updatedAt = ?
      WHERE id = ?
    `).run(
      updateData.status,
      updateData.editedData || null,
      updateData.approvedAt || null,
      updateData.rejectedAt || null,
      updateData.updatedAt,
      id
    );

    // If approved, enqueue calendar creation
    if (status === 'approved') {
      console.log(`📅 Enqueueing calendar creation for approval: ${id}`);
      
      try {
        await calendarQueue.add({
          approvalId: id
        }, {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000
          }
        });
        
        console.log('✅ Calendar creation job enqueued');
      } catch (queueError: any) {
        console.error('⚠️  Failed to enqueue calendar creation:', queueError.message);
        // Don't fail the approval if calendar enqueueing fails
      }
    }

    res.json({ success: true, message: 'Approval updated' });
  } catch (error) {
    console.error('Update approval error:', error);
    res.status(500).json({ error: 'Failed to update approval' });
  }
});

// Get approval counts by status
router.get('/stats/counts', async (req, res) => {
  try {
    const deviceId = req.query.deviceId as string | undefined;

    let query = 'SELECT status, COUNT(*) as count FROM approvals';
    const params: any[] = [];

    if (deviceId) {
      query += ' WHERE deviceId = ?';
      params.push(deviceId);
    }

    query += ' GROUP BY status';

    const results = db.prepare(query).all(...params) as { status: string; count: number }[];
    
    const counts = {
      pending: 0,
      approved: 0,
      rejected: 0
    };

    results.forEach(r => {
      counts[r.status as keyof typeof counts] = r.count;
    });

    res.json({ success: true, counts });
  } catch (error) {
    console.error('Get approval counts error:', error);
    res.status(500).json({ error: 'Failed to get approval counts' });
  }
});

export default router;
