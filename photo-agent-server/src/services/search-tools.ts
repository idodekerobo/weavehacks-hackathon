/**
 * Search Tools for OpenAI Agents SDK
 * 
 * These tools are used by the search agent to find photos in the database.
 * Tools are defined using the OpenAI Agents SDK `tool()` function with JSON schemas.
 * 
 * Embeddings are still generated via Ollama (nomic-embed-text) for cost efficiency.
 */

import { db } from '../db/sqlite';
import { tool, type FunctionTool } from '@openai/agents';
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
 * Generate embedding for a query using Ollama (local, free)
 */
async function generateEmbedding(text: string): Promise<number[]> {
  try {
    console.log(`   🧮 Generating embedding via Ollama (${EMBEDDING_MODEL})...`);
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

// Result type for search results
interface SearchResult {
  id: string;
  photoLibraryId: string;
  summary: string | null;
  ocrText: string | null;
  intentType: string | null;
  confidence: number | null;
  creationDate: string | null;
  filename: string | null;
  similarity?: number;
  latitude: number | null;
  longitude: number | null;
}

// MARK: - Tool Definitions (OpenAI Agents SDK Format with JSON Schema)

/**
 * Tool 1: Semantic search by embedding similarity
 * Uses Ollama for embedding generation (local, free)
 */
export const searchByEmbedding: FunctionTool = tool({
  name: 'search_by_embedding',
  description: 'Search for photos using semantic similarity. Use this for natural language queries like "red flowers", "concert photos", "code screenshots". Returns photos ranked by semantic similarity to the query.',
  parameters: {
    type: 'object' as const,
    properties: {
      query: { type: 'string' as const, description: 'The search query to find similar images' },
      topK: { type: 'number' as const, description: 'Number of results to return (default 20)' }
    },
    required: ['query'] as const,
    additionalProperties: true as const
  },
  strict: false as const,
  execute: async (input: unknown): Promise<string> => {
    const args = (typeof input === 'string' ? JSON.parse(input) : input) as { query: string; topK?: number };
    const { query, topK = 20 } = args;
    
    console.log(`🔍 Embedding search: "${query}" (top ${topK})`);
    
    // Generate query embedding using Ollama (local)
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
    const results: SearchResult[] = assets.map(asset => {
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
      .sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
      .slice(0, topK);
    
    console.log(`  → Found ${topResults.length} results (top similarity: ${topResults[0]?.similarity?.toFixed(3) || 'N/A'})`);
    
    return JSON.stringify({
      results: topResults,
      count: topResults.length,
      searchType: 'embedding'
    });
  }
});

/**
 * Tool 2: Full-text search on OCR and summary
 */
export const searchByText: FunctionTool = tool({
  name: 'search_by_text',
  description: 'Search for exact text matches in OCR or image summaries. Use this when looking for specific words or phrases that might appear in text within images.',
  parameters: {
    type: 'object' as const,
    properties: {
      query: { type: 'string' as const, description: 'The text to search for' },
      searchInSummary: { type: 'boolean' as const, description: 'Search in image summaries (default true)' },
      searchInOcr: { type: 'boolean' as const, description: 'Search in OCR extracted text (default true)' }
    },
    required: ['query'] as const,
    additionalProperties: true as const
  },
  strict: false as const,
  execute: async (input: unknown): Promise<string> => {
    const args = (typeof input === 'string' ? JSON.parse(input) : input) as { query: string; searchInSummary?: boolean; searchInOcr?: boolean };
    const { query, searchInSummary = true, searchInOcr = true } = args;
    
    console.log(`🔍 Text search: "${query}" (summary: ${searchInSummary}, ocr: ${searchInOcr})`);
    
    const conditions: string[] = [];
    if (searchInSummary) conditions.push('summary LIKE ?');
    if (searchInOcr) conditions.push('ocrText LIKE ?');
    
    if (conditions.length === 0) {
      return JSON.stringify({ results: [], count: 0, searchType: 'text' });
    }
    
    const whereClause = conditions.join(' OR ');
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
      WHERE ${whereClause}
    `);
    
    const params = conditions.map(() => searchPattern);
    const assets = stmt.all(...params) as any[];
    
    const results: SearchResult[] = assets.map(asset => ({
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
    
    console.log(`  → Found ${results.length} text matches`);
    
    return JSON.stringify({
      results,
      count: results.length,
      searchType: 'text'
    });
  }
});

/**
 * Tool 3: Filter by intent type
 */
export const filterByIntent: FunctionTool = tool({
  name: 'filter_by_intent',
  description: 'Filter photos by their detected intent type. Use this to narrow down results to specific categories like event flyers, general photos, or other types.',
  parameters: {
    type: 'object' as const,
    properties: {
      intentType: { 
        type: 'string' as const, 
        enum: ['event_flyer', 'general_photo', 'other'] as const,
        description: 'The intent type to filter by' 
      },
      minimumConfidence: { type: 'number' as const, description: 'Minimum confidence score (0.0-1.0, default 0.0)' }
    },
    required: ['intentType'] as const,
    additionalProperties: true as const
  },
  strict: false as const,
  execute: async (input: unknown): Promise<string> => {
    const args = (typeof input === 'string' ? JSON.parse(input) : input) as { intentType: string; minimumConfidence?: number };
    const { intentType, minimumConfidence = 0.0 } = args;
    
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
    
    const assets = stmt.all(`%"${intentType}"%`, minimumConfidence) as any[];
    
    const results: SearchResult[] = assets.map(asset => ({
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
    
    console.log(`  → Found ${results.length} ${intentType} results`);
    
    return JSON.stringify({
      results,
      count: results.length,
      searchType: 'intent_filter'
    });
  }
});

/**
 * Tool 4: Filter by date range
 */
export const filterByDateRange: FunctionTool = tool({
  name: 'filter_by_date_range',
  description: 'Filter photos by when they were taken. Supports natural language expressions like "this week", "last 7 days", "today", "yesterday".',
  parameters: {
    type: 'object' as const,
    properties: {
      dateExpression: { 
        type: 'string' as const, 
        description: 'Natural language date expression (e.g., "this week", "last 7 days", "today")' 
      }
    },
    required: ['dateExpression'] as const,
    additionalProperties: true as const
  },
  strict: false as const,
  execute: async (input: unknown): Promise<string> => {
    const args = (typeof input === 'string' ? JSON.parse(input) : input) as { dateExpression: string };
    const { dateExpression } = args;
    
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
    
    const assets = stmt.all(...params) as any[];
    
    const results: SearchResult[] = assets.map(asset => ({
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
    
    console.log(`  → Found ${results.length} results for "${dateExpression}"`);
    
    return JSON.stringify({
      results,
      count: results.length,
      searchType: 'date_filter'
    });
  }
});

/**
 * Tool 5: Filter by location proximity
 */
export const filterByLocation: FunctionTool = tool({
  name: 'filter_by_location',
  description: 'Filter photos by location proximity. Use this when searching for photos taken in a specific area or city.',
  parameters: {
    type: 'object' as const,
    properties: {
      locationQuery: { 
        type: 'string' as const, 
        description: 'Location name or description (e.g., "San Francisco", "near Golden Gate Bridge")' 
      },
      radiusMiles: { type: 'number' as const, description: 'Search radius in miles (default 10)' }
    },
    required: ['locationQuery'] as const,
    additionalProperties: true as const
  },
  strict: false as const,
  execute: async (input: unknown): Promise<string> => {
    const args = (typeof input === 'string' ? JSON.parse(input) : input) as { locationQuery: string; radiusMiles?: number };
    const { locationQuery, radiusMiles = 10 } = args;
    
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
    const assets = stmt.all(searchPattern, searchPattern) as any[];
    
    const results: SearchResult[] = assets.map(asset => ({
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
    
    console.log(`  → Found ${results.length} location matches`);
    
    return JSON.stringify({
      results,
      count: results.length,
      searchType: 'location_filter'
    });
  }
});

/**
 * Tool 6: Combine and deduplicate results
 */
export const combineResults: FunctionTool = tool({
  name: 'combine_results',
  description: 'Combine multiple search results and remove duplicates. Use this after calling multiple search tools to merge and deduplicate the results.',
  parameters: {
    type: 'object' as const,
    properties: {
      resultSets: { 
        type: 'array' as const, 
        items: {
          type: 'object' as const
        },
        description: 'Array of result sets to combine' 
      },
      maxResults: { type: 'number' as const, description: 'Maximum number of results to return (default 10)' }
    },
    required: ['resultSets'] as const,
    additionalProperties: true as const
  },
  strict: false as const,
  execute: async (input: unknown): Promise<string> => {
    const args = (typeof input === 'string' ? JSON.parse(input) : input) as { resultSets: { results: any[]; count: number; searchType: string }[]; maxResults?: number };
    const { resultSets, maxResults = 10 } = args;
    
    console.log(`🔍 Combining ${resultSets.length} result sets`);
    
    const seenIds = new Set<string>();
    const combined: SearchResult[] = [];
    
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
    
    return JSON.stringify({
      results: final,
      count: final.length,
      searchType: 'combined'
    });
  }
});

// Export all tools as an array for the agent
export const searchTools: FunctionTool[] = [
  searchByEmbedding,
  searchByText,
  filterByIntent,
  filterByDateRange,
  filterByLocation,
  combineResults
];
