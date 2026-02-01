import express, { Request, Response } from 'express';
import { db } from '../db/sqlite';

const router = express.Router();

// Register a new device (iOS/macOS)
router.post('/', (req: Request, res: Response) => {
  const { deviceId, deviceType, deviceName, systemVersion } = req.body;

  if (!deviceId || !deviceType) {
    return res.status(400).json({ error: 'deviceId and deviceType are required' });
  }

  try {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO devices (deviceId, deviceType, deviceName, systemVersion, lastSeen)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    stmt.run(deviceId, deviceType, deviceName, systemVersion);

    res.json({ 
      success: true, 
      message: 'Device registered successfully',
      deviceId 
    });
  } catch (error) {
    console.error('Device registration error:', error);
    res.status(500).json({ error: 'Failed to register device' });
  }
});

// Get all registered devices
router.get('/', (req: Request, res: Response) => {
  try {
    const devices = db.prepare('SELECT * FROM devices ORDER BY lastSeen DESC').all();
    res.json({ devices });
  } catch (error) {
    console.error('Failed to fetch devices:', error);
    res.status(500).json({ error: 'Failed to fetch devices' });
  }
});

// Update device last seen timestamp
router.patch('/:deviceId', (req: Request, res: Response) => {
  const { deviceId } = req.params;

  try {
    const stmt = db.prepare('UPDATE devices SET lastSeen = CURRENT_TIMESTAMP WHERE deviceId = ?');
    const result = stmt.run(deviceId);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }

    res.json({ success: true, message: 'Device updated' });
  } catch (error) {
    console.error('Failed to update device:', error);
    res.status(500).json({ error: 'Failed to update device' });
  }
});

export default router;
