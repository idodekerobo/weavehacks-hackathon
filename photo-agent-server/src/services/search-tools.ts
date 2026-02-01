import { db } from '../db/sqlite';
import { tool } from 'ai';
import { z } from 'zod';
import axios from 'axios';

const OLLAMA_BASE_URL = 'http://localhost:11434';
const EMBEDDING_MODEL = 'nomic-embed-text';

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }
  
  const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  
  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }
  
  return dotProduct / (magnitudeA * magnitudeB);
}

/**
 * Generate embedding for a query using Ollama
 */
async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const response = await axios.post(`${OLLAMA_BASE_URL}/api/embeddings`, {
      model: EMBEDDING_MODEL,
      prompt: text
    });
    return response.data.embedding;
  } catch (error) {
    console.error('Failed to generate embedding:', error);
    throw new Error('Failed to generate query embedding');
  }
}

/**
 * Calculate haversine distance between two lat/lng points in miles
 */
function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 3959; // Earth's radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Parse natural language date expressions into SQL WHERE clause
 */
function parseDateRange(dateExpression: string): { sql: string; params: any[] } {
  const now = new Date();
  const lowerExpr = dateExpression.toLowerCase();
  
  // "this week"
  if (lowerExpr.includes('this week')) {
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    return {
      sql: 'creationDate >= ?',
      params: [startOfWeek.toISOString()]
    };
  }
  
  // "last week"
  if (lowerExpr.includes('last week')) {
    const startOfLastWeek = new Date(now);
    startOfLastWeek.setDate(now.getDate() - now.getDay() - 7);
    startOfLastWeek.setHours(0, 0, 0, 0);
    const endOfLastWeek = new Date(startOfLastWeek);
    endOfLastWeek.setDate(startOfLastWeek.getDate() + 7);
    return {
      sql: 'creationDate >= ? AND creationDate < ?',
      params: [startOfLastWeek.toISOString(), endOfLastWeek.toISOString()]
    };
  }
  
  // "today"
  if (lowerExpr.includes('today')) {
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    return {
      sql: 'creationDate >= ?',
      params: [startOfDay.toISOString()]
    };
  }
  
  // "yesterday"
  if (lowerExpr.includes('yesterday')) {
    const startOfYesterday = new Date(now);
    startOfYesterday.setDate(now.getDate() - 1);
    startOfYesterday.setHours(0, 0, 0, 0);
    const endOfYesterday = new Date(startOfYesterday);
    endOfYesterday.setDate(startOfYesterday.getDate() + 1);
    return {
      sql: 'creationDate >= ? AND creationDate < ?',
      params: [startOfYesterday.toISOString(), endOfYesterday.toISOString()]
    };
  }
  
  // "last N days"
  const lastDaysMatch = lowerExpr.match(/last (\d+) days?/);
  if (lastDaysMatch) {
    const days = parseInt(lastDaysMatch[1]);
    const startDate = new Date(now);
    startDate.setDate(now.getDate() - days);
    return {
      sql: 'creationDate >= ?',
      params: [startDate.toISOString()]
    };
  }
  
  // Default: no date filter
  return { sql: '1=1', params: [] };
}

// MARK: - Tool Definitions

/**
 * Tool 1: Semantic search by embedding similarity
 */
export const searchByEmbedding = tool({
  description: 'Search for photos using semantic similarity. Use this for natural language queries like "red flowers", "concert photos", "code screenshots".',
  parameters: z.object({
    query: z.string().describe('The search query to find similar images'),
    topK: z.number().default(20).describe('Number of results to return (default 20)')
  }),
  execute: async ({ query, topK }) => {
    console.log(`🔍 Embedding search: "${query}" (top ${topK})`);
    
    // Generate query embedding
    const queryEmbedding = await generateEmbedding(query);
    
    // Fetch all assets with embeddings
    const stmt = db.prepare(`
      SELECT 
        id, 
        photoLibraryId,
        summary, 
        ocrText, 
        embedding, 
        intentLabels,
        confidence,
        creationDate,
        filename,
        latitude,
        longitude
      FROM assets 
      WHERE embedding IS NOT NULL
    `);
    
    const assets = stmt.all() as any[];
    
    // Calculate similarity for each asset
    const results = assets.map(asset => {
      const embedding = JSON.parse(asset.embedding);
      const similarity = cosineSimilarity(queryEmbedding, embedding);
      
      return {
        id: asset.id,
        photoLibraryId: asset.photoLibraryId,
        summary: asset.summary,
        ocrText: asset.ocrText,
        intentType: asset.intentLabels ? JSON.parse(asset.intentLabels)[0] : null,
        confidence: asset.confidence,
        creationDate: asset.creationDate,
        filename: asset.filename,
        similarity,
        latitude: asset.latitude,
        longitude: asset.longitude
      };
    });
    
    // Sort by similarity and take top K
    const topResults = results
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);
    
    console.log(`  → Found ${topResults.length} results (top similarity: ${topResults[0]?.similarity.toFixed(3) || 'N/A'})`);
    
    return {
      results: topResults,
      count: topResults.length,
      searchType: 'embedding'
    };
  }
});

/**
 * Tool 2: Full-text search on OCR and summary
 */
export const searchByText = tool({
  description: 'Search for exact text matches in OCR or image summaries. Use this when looking for specific words or phrases.',
  parameters: z.object({
    query: z.string().describe('The text to search for'),
    fields: z.array(z.enum(['summary', 'ocrText', 'both'])).default(['both']).describe('Which fields to search')
  }),
  execute: async ({ query, fields }) => {
    console.log(`🔍 Text search: "${query}" in ${fields.join(', ')}`);
    
    const searchFields = fields.includes('both') ? ['summary', 'ocrText'] : fields;
    const conditions = searchFields.map(field => `${field} LIKE ?`).join(' OR ');
    const searchPattern = `%${query}%`;
    
    const stmt = db.prepare(`
      SELECT 
        id,
        photoLibraryId,
        summary,
        ocrText,
        intentLabels,
        confidence,
        creationDate,
        filename,
        latitude,
        longitude
      FROM assets
      WHERE ${conditions}
    `);
    
    const params = searchFields.map(() => searchPattern);
    const results = stmt.all(...params) as any[];
    
    const formattedResults = results.map(asset => ({
      id: asset.id,
      photoLibraryId: asset.photoLibraryId,
      summary: asset.summary,
      ocrText: asset.ocrText,
      intentType: asset.intentLabels ? JSON.parse(asset.intentLabels)[0] : null,
      confidence: asset.confidence,
      creationDate: asset.creationDate,
      filename: asset.filename,
      latitude: asset.latitude,
      longitude: asset.longitude
    }));
    
    console.log(`  → Found ${formattedResults.length} text matches`);
    
    return {
      results: formattedResults,
      count: formattedResults.length,
      searchType: 'text'
    };
  }
});

/**
 * Tool 3: Filter by intent type
 */
export const filterByIntent = tool({
  description: 'Filter photos by their detected intent type (event_flyer, general_photo, or other). Use this to narrow down results.',
  parameters: z.object({
    intentType: z.enum(['event_flyer', 'general_photo', 'other']).describe('The intent type to filter by'),
    minimumConfidence: z.number().default(0.0).describe('Minimum confidence score (0.0-1.0)')
  }),
  execute: async ({ intentType, minimumConfidence }) => {
    console.log(`🔍 Intent filter: ${intentType} (min confidence: ${minimumConfidence})`);
    
    const stmt = db.prepare(`
      SELECT 
        id,
        photoLibraryId,
        summary,
        ocrText,
        intentLabels,
        confidence,
        creationDate,
        filename,
        latitude,
        longitude
      FROM assets
      WHERE intentLabels LIKE ? AND confidence >= ?
    `);
    
    const results = stmt.all(`%"${intentType}"%`, minimumConfidence) as any[];
    
    const formattedResults = results.map(asset => ({
      id: asset.id,
      photoLibraryId: asset.photoLibraryId,
      summary: asset.summary,
      ocrText: asset.ocrText,
      intentType: asset.intentLabels ? JSON.parse(asset.intentLabels)[0] : null,
      confidence: asset.confidence,
      creationDate: asset.creationDate,
      filename: asset.filename,
      latitude: asset.latitude,
      longitude: asset.longitude
    }));
    
    console.log(`  → Found ${formattedResults.length} ${intentType} results`);
    
    return {
      results: formattedResults,
      count: formattedResults.length,
      searchType: 'intent_filter'
    };
  }
});

/**
 * Tool 4: Filter by date range
 */
export const filterByDateRange = tool({
  description: 'Filter photos by when they were taken. Supports natural language like "this week", "last 7 days", "today", "yesterday".',
  parameters: z.object({
    dateExpression: z.string().describe('Natural language date expression (e.g., "this week", "last 7 days", "today")')
  }),
  execute: async ({ dateExpression }) => {
    console.log(`🔍 Date filter: "${dateExpression}"`);
    
    const { sql, params } = parseDateRange(dateExpression);
    
    const stmt = db.prepare(`
      SELECT 
        id,
        photoLibraryId,
        summary,
        ocrText,
        intentLabels,
        confidence,
        creationDate,
        filename,
        latitude,
        longitude
      FROM assets
      WHERE ${sql}
      ORDER BY creationDate DESC
    `);
    
    const results = stmt.all(...params) as any[];
    
    const formattedResults = results.map(asset => ({
      id: asset.id,
      photoLibraryId: asset.photoLibraryId,
      summary: asset.summary,
      ocrText: asset.ocrText,
      intentType: asset.intentLabels ? JSON.parse(asset.intentLabels)[0] : null,
      confidence: asset.confidence,
      creationDate: asset.creationDate,
      filename: asset.filename,
      latitude: asset.latitude,
      longitude: asset.longitude
    }));
    
    console.log(`  → Found ${formattedResults.length} results for "${dateExpression}"`);
    
    return {
      results: formattedResults,
      count: formattedResults.length,
      searchType: 'date_filter'
    };
  }
});

/**
 * Tool 5: Filter by location proximity
 */
export const filterByLocation = tool({
  description: 'Filter photos by location proximity. Use this when searching for photos taken in a specific area or city.',
  parameters: z.object({
    locationQuery: z.string().describe('Location name or description (e.g., "San Francisco", "near Golden Gate Bridge")'),
    radiusMiles: z.number().default(10).describe('Search radius in miles (default 10)')
  }),
  execute: async ({ locationQuery, radiusMiles }) => {
    console.log(`🔍 Location filter: "${locationQuery}" within ${radiusMiles} miles`);
    
    // For hackathon: simplified implementation
    // In production, you'd geocode the locationQuery first
    // For now, we'll search for location keywords in summary/OCR
    
    const stmt = db.prepare(`
      SELECT 
        id,
        photoLibraryId,
        summary,
        ocrText,
        intentLabels,
        confidence,
        creationDate,
        filename,
        latitude,
        longitude
      FROM assets
      WHERE (summary LIKE ? OR ocrText LIKE ?)
        AND latitude IS NOT NULL 
        AND longitude IS NOT NULL
    `);
    
    const searchPattern = `%${locationQuery}%`;
    const results = stmt.all(searchPattern, searchPattern) as any[];
    
    const formattedResults = results.map(asset => ({
      id: asset.id,
      photoLibraryId: asset.photoLibraryId,
      summary: asset.summary,
      ocrText: asset.ocrText,
      intentType: asset.intentLabels ? JSON.parse(asset.intentLabels)[0] : null,
      confidence: asset.confidence,
      creationDate: asset.creationDate,
      filename: asset.filename,
      latitude: asset.latitude,
      longitude: asset.longitude
    }));
    
    console.log(`  → Found ${formattedResults.length} location matches`);
    
    return {
      results: formattedResults,
      count: formattedResults.length,
      searchType: 'location_filter'
    };
  }
});

/**
 * Tool 6: Combine and deduplicate results
 */
export const combineResults = tool({
  description: 'Combine multiple search results and remove duplicates. Use this after calling multiple search tools.',
  parameters: z.object({
    resultSets: z.array(z.any()).describe('Array of result sets to combine'),
    maxResults: z.number().default(10).describe('Maximum number of results to return')
  }),
  execute: async ({ resultSets, maxResults }) => {
    console.log(`🔍 Combining ${resultSets.length} result sets`);
    
    const seenIds = new Set<string>();
    const combined: any[] = [];
    
    // Flatten and deduplicate
    for (const resultSet of resultSets) {
      const results = resultSet.results || [];
      for (const result of results) {
        if (!seenIds.has(result.id)) {
          seenIds.add(result.id);
          combined.push(result);
        }
      }
    }
    
    // Take top maxResults
    const final = combined.slice(0, maxResults);
    
    console.log(`  → Combined to ${final.length} unique results`);
    
    return {
      results: final,
      count: final.length,
      searchType: 'combined'
    };
  }
});
