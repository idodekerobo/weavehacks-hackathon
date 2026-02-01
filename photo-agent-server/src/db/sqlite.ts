import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.join(__dirname, '../../data/photos.db');
const DATA_DIR = path.dirname(DB_PATH);

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export const db = new Database(DB_PATH);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS assets (
    id TEXT PRIMARY KEY,
    photoLibraryId TEXT NOT NULL,
    contentHash TEXT UNIQUE NOT NULL,
    deviceId TEXT,
    creationDate TEXT,
    latitude REAL,
    longitude REAL,
    altitude REAL,
    filename TEXT,
    mediaType TEXT NOT NULL,
    isFavorite INTEGER DEFAULT 0,
    ocrText TEXT,
    summary TEXT,
    embedding TEXT,
    intentLabels TEXT,
    confidence REAL,
    imageData BLOB,
    createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
    updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_content_hash ON assets(contentHash);
  CREATE INDEX IF NOT EXISTS idx_creation_date ON assets(creationDate DESC);
  CREATE INDEX IF NOT EXISTS idx_device_id ON assets(deviceId);
  CREATE INDEX IF NOT EXISTS idx_photo_library_id ON assets(photoLibraryId);

  CREATE TABLE IF NOT EXISTS devices (
    deviceId TEXT PRIMARY KEY,
    deviceType TEXT NOT NULL,
    deviceName TEXT,
    systemVersion TEXT,
    lastSeen TEXT DEFAULT CURRENT_TIMESTAMP,
    createdAt TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_device_type ON devices(deviceType);
  CREATE INDEX IF NOT EXISTS idx_last_seen ON devices(lastSeen DESC);

  CREATE TABLE IF NOT EXISTS approvals (
    id TEXT PRIMARY KEY,
    assetId TEXT NOT NULL,
    deviceId TEXT,
    intentType TEXT NOT NULL,
    extractedData TEXT,
    proposedAction TEXT,
    confidence REAL,
    status TEXT DEFAULT 'pending',
    editedData TEXT,
    approvedAt TEXT,
    rejectedAt TEXT,
    createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
    updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (assetId) REFERENCES assets(id)
  );

  CREATE INDEX IF NOT EXISTS idx_approval_status ON approvals(status);
  CREATE INDEX IF NOT EXISTS idx_approval_device ON approvals(deviceId);
  CREATE INDEX IF NOT EXISTS idx_approval_asset ON approvals(assetId);
  CREATE INDEX IF NOT EXISTS idx_approval_created ON approvals(createdAt DESC);
`);

console.log('✅ SQLite database initialized');
