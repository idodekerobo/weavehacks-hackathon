import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import assetsRouter from './routes/assets';
import { serverAdapter } from './services/queue';
import './db/sqlite';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 1738;

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/assets', assetsRouter);
app.use('/admin/queues', serverAdapter.getRouter());

app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Legacy endpoint for backward compatibility (metadata only)
app.post('/api/assets', (req: Request, res: Response) => {
  res.status(400).json({ 
    error: 'This endpoint is deprecated. Please use POST /api/assets/upload with multipart/form-data instead.',
    migration_note: 'The new endpoint accepts image data along with metadata for centralized analysis.'
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 Bull Board available at http://localhost:${PORT}/admin/queues`);
});
