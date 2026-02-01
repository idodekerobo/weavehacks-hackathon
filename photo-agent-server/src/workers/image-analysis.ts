import { imageAnalysisQueue, intentRoutingQueue } from '../services/queue';
import { db } from '../db/sqlite';
import { analyzeImage } from '../services/ollama';
import { logAttributes } from '../services/weave';

imageAnalysisQueue.process(4, async (job) => { // 4 concurrent
  const { assetId } = job.data;

  logAttributes({
    operation: 'image_analysis',
    assetId
  });

  // Fetch asset from database
  const asset = db.prepare('SELECT imageData FROM assets WHERE id = ?').get(assetId) as { imageData: Buffer } | undefined;
  if (!asset) {
    throw new Error(`Asset not found: ${assetId}`);
  }

  // Analyze image
  const { summary, ocrText, embedding } = await analyzeImage(asset.imageData);

  // Update database
  db.prepare(`
    UPDATE assets
    SET ocrText = ?, summary = ?, embedding = ?, updatedAt = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(ocrText, summary, JSON.stringify(embedding), assetId);

  console.log(`✅ Analyzed asset: ${assetId}`);

  logAttributes({
    analysisComplete: true,
    hasSummary: !!summary,
    hasOcrText: !!ocrText,
    embeddingDimension: embedding.length
  });

  // Enqueue for intent routing
  await intentRoutingQueue.add({ assetId });

  return { assetId };
});

console.log('✅ Image analysis worker started (concurrency: 4)');
