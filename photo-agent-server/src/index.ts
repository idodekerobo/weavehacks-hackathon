import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import assetsRouter from './routes/assets';
import devicesRouter from './routes/devices';
import approvalsRouter from './routes/approvals';
import searchRouter from './routes/search';
import oauthRouter from './routes/oauth';
import { serverAdapter } from './services/queue';
import { initWeave } from './services/weave';
import './db/sqlite';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 1738;

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/assets', assetsRouter);
app.use('/api/devices', devicesRouter);
app.use('/api/approvals', approvalsRouter);
app.use('/api/search', searchRouter);
app.use('/api/oauth', oauthRouter);
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

// Initialize Weave before starting server
(async () => {
  await initWeave();
  
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📊 Bull Board available at http://localhost:${PORT}/admin/queues`);
  });
})();
