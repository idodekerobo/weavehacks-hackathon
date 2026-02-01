import Bull from 'bull';
import { createBullBoard } from '@bull-board/api';
import { BullAdapter } from '@bull-board/api/bullAdapter';
import { ExpressAdapter } from '@bull-board/express';

// Redis connection config (ioredis format)
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy: (times: number) => {
    // Retry connection with exponential backoff
    if (times > 10) {
      console.error('❌ Could not connect to Redis after 10 attempts');
      return null;
    }
    const delay = Math.min(times * 50, 2000);
    return delay;
  }
};

// Create queues
export const imageUploadQueue = new Bull('image-upload', {
  redis: redisConfig
});

export const imageAnalysisQueue = new Bull('image-analysis', {
  redis: redisConfig
});

export const intentRoutingQueue = new Bull('intent-routing', {
  redis: redisConfig
});

export const eventSearchQueue = new Bull('event-search', {
  redis: redisConfig
});

export const calendarQueue = new Bull('calendar-creation', {
  redis: redisConfig
});

export const rsvpQueue = new Bull('rsvp-automation', {
  redis: redisConfig
});

// Bull Board UI
export const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

createBullBoard({
  queues: [
    new BullAdapter(imageUploadQueue),
    new BullAdapter(imageAnalysisQueue),
    new BullAdapter(intentRoutingQueue),
    new BullAdapter(eventSearchQueue),
    new BullAdapter(calendarQueue),
    new BullAdapter(rsvpQueue)
  ],
  serverAdapter
});

// Log connection status
imageUploadQueue.client.on('ready', () => {
  console.log('✅ Bull queues connected to Redis');
});

imageUploadQueue.client.on('error', (err) => {
  console.error('❌ Redis connection error:', err.message);
  console.log('⚠️  Make sure Redis is running: brew services start redis');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 Shutting down queues...');
  await imageUploadQueue.close();
  await imageAnalysisQueue.close();
  await intentRoutingQueue.close();
  await eventSearchQueue.close();
  await calendarQueue.close();
  await rsvpQueue.close();
});

console.log('✅ Bull queue service initialized');
