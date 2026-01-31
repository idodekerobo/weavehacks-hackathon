import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.get('/', (req: Request, res: Response) => {
  res.json({
    message: 'Photos Agent Server - Hello World',
    version: '0.1.0',
    status: 'running'
  });
});

app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Photos endpoints (placeholder)
app.get('/api/photos', (req: Request, res: Response) => {
  res.json({
    message: 'Photos endpoint - ready for implementation',
    count: 0,
    photos: []
  });
});

app.post('/api/photos/upload', (req: Request, res: Response) => {
  res.json({
    message: 'Photo upload endpoint - ready for implementation',
    success: true
  });
});

// Intent endpoints (placeholder)
app.get('/api/intents', (req: Request, res: Response) => {
  res.json({
    message: 'Intents endpoint - ready for implementation',
    count: 0,
    intents: []
  });
});

// Approvals endpoints (placeholder)
app.get('/api/approvals', (req: Request, res: Response) => {
  res.json({
    message: 'Approvals endpoint - ready for implementation',
    pending: 0,
    approvals: []
  });
});

app.post('/api/approvals/:id/approve', (req: Request, res: Response) => {
  const { id } = req.params;
  res.json({
    message: `Approval ${id} endpoint - ready for implementation`,
    approved: true
  });
});

// System status endpoint
app.get('/api/system/status', (req: Request, res: Response) => {
  res.json({
    agent: {
      status: 'ready',
      models_loaded: false
    },
    tunnel: {
      status: 'offline',
      endpoint: null
    },
    queue: {
      pending: 0,
      running: 0,
      waiting_approval: 0
    },
    redis: {
      connected: false
    }
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Photos Agent Server running on http://localhost:${PORT}`);
  console.log(`📸 Ready to process photos and intents`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
});
