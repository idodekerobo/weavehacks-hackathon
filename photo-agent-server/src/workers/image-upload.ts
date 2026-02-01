import { imageUploadQueue, imageAnalysisQueue } from '../services/queue';
import { db } from '../db/sqlite';
import { v4 as uuidv4 } from 'uuid';
import { logAttributes } from '../services/weave';

imageUploadQueue.process(async (job) => {
  const { photoLibraryId, contentHash, deviceId, creationDate, latitude, longitude, altitude, filename, mediaType, isFavorite, imageData } = job.data;

  logAttributes({
    operation: 'image_upload',
    photoLibraryId,
    contentHash,
    deviceId,
    mediaType,
    hasLocation: !!(latitude && longitude)
  });

  // Store in database
  const assetId = uuidv4();
  const imageBuffer = Buffer.from(imageData, 'base64');

  db.prepare(`
    INSERT INTO assets (id, photoLibraryId, contentHash, deviceId, creationDate, latitude, longitude, altitude, filename, mediaType, isFavorite, imageData)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(assetId, photoLibraryId, contentHash, deviceId, creationDate, latitude, longitude, altitude, filename, mediaType, isFavorite ? 1 : 0, imageBuffer);

  console.log(`✅ Stored asset: ${assetId}`);

  logAttributes({
    assetId,
    storageSuccess: true
  });

  // Enqueue for analysis
  await imageAnalysisQueue.add({ assetId });

  return { assetId };
});

console.log('✅ Image upload worker started');
