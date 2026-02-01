// Central workers entry point
// This file is run as a separate process via npm run dev:workers
import { initWeave } from '../services/weave';
import './image-upload';
import './image-analysis';
import './intent-routing';

// Initialize Weave for all workers
(async () => {
  await initWeave();
  console.log('✅ All workers started');
})();

// Keep process alive
process.on('SIGTERM', () => {
  console.log('🛑 Shutting down workers...');
  process.exit(0);
});
