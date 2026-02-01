// Central workers entry point
// This file is run as a separate process via npm run dev:workers
import './image-upload';
import './image-analysis';

console.log('✅ All workers started');

// Keep process alive
process.on('SIGTERM', () => {
  console.log('🛑 Shutting down workers...');
  process.exit(0);
});
