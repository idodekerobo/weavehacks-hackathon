import express from 'express';
import multer from 'multer';
import crypto from 'crypto';
import { db } from '../db/sqlite';
import { imageUploadQueue, imageAnalysisQueue, intentRoutingQueue } from '../services/queue';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post('/upload', upload.single('image'), async (req, res) => {
  try {
    const { photoLibraryId, deviceId, creationDate, latitude, longitude, altitude, filename, mediaType, isFavorite } = req.body;
    const imageData = req.file?.buffer;

    if (!imageData) {
      return res.status(400).json({ error: 'No image provided' });
    }

    // Compute content hash
    const contentHash = crypto.createHash('sha256').update(imageData).digest('hex');

    // Check if already exists
    const existing = db.prepare('SELECT id FROM assets WHERE contentHash = ?').get(contentHash) as { id: string } | undefined;
    if (existing) {
      return res.json({ success: true, assetId: existing.id, deduplicated: true });
    }

    // Enqueue for processing
    const job = await imageUploadQueue.add({
      photoLibraryId,
      contentHash,
      deviceId,
      creationDate,
      latitude: latitude ? parseFloat(latitude) : null,
      longitude: longitude ? parseFloat(longitude) : null,
      altitude: altitude ? parseFloat(altitude) : null,
      filename,
      mediaType,
      isFavorite: isFavorite === 'true',
      imageData: imageData.toString('base64')
    });

    res.json({ success: true, jobId: job.id });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Get all assets
router.get('/', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;

    const assets = db.prepare(`
      SELECT id, photoLibraryId, contentHash, deviceId, creationDate, latitude, longitude, altitude, 
             filename, mediaType, isFavorite, ocrText, summary, intentLabels, confidence, createdAt, updatedAt
      FROM assets
      ORDER BY creationDate DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset);

    const total = (db.prepare('SELECT COUNT(*) as count FROM assets').get() as { count: number }).count;

    res.json({ success: true, assets, total, limit, offset });
  } catch (error) {
    console.error('Get assets error:', error);
    res.status(500).json({ error: 'Failed to retrieve assets' });
  }
});

// Get single asset
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const asset = db.prepare(`
      SELECT id, photoLibraryId, contentHash, deviceId, creationDate, latitude, longitude, altitude,
             filename, mediaType, isFavorite, ocrText, summary, intentLabels, confidence, createdAt, updatedAt
      FROM assets
      WHERE id = ?
    `).get(id);

    if (!asset) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    res.json({ success: true, asset });
  } catch (error) {
    console.error('Get asset error:', error);
    res.status(500).json({ error: 'Failed to retrieve asset' });
  }
});

// Get asset image data
router.get('/:id/image', async (req, res) => {
  try {
    const { id } = req.params;
    const result = db.prepare('SELECT imageData, mediaType FROM assets WHERE id = ?').get(id) as { imageData: Buffer; mediaType: string } | undefined;

    if (!result || !result.imageData) {
      return res.status(404).json({ error: 'Image not found' });
    }

    res.contentType(result.mediaType || 'image/jpeg');
    res.send(result.imageData);
  } catch (error) {
    console.error('Get image error:', error);
    res.status(500).json({ error: 'Failed to retrieve image' });
  }
});

// Delete asset
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = db.prepare('DELETE FROM assets WHERE id = ?').run(id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    res.json({ success: true, message: 'Asset deleted' });
  } catch (error) {
    console.error('Delete asset error:', error);
    res.status(500).json({ error: 'Failed to delete asset' });
  }
});

// Get queue status
router.get('/queue/status', async (req, res) => {
  try {
    const uploadCounts = await imageUploadQueue.getJobCounts();
    const analysisCounts = await imageAnalysisQueue.getJobCounts();
    const intentCounts = await intentRoutingQueue.getJobCounts();

    res.json({
      success: true,
      queues: {
        upload: uploadCounts,
        analysis: analysisCounts,
        intent: intentCounts
      }
    });
  } catch (error) {
    console.error('Queue status error:', error);
    res.status(500).json({ error: 'Failed to get queue status' });
  }
});

export default router;
