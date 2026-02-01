import { Router } from 'express';
import { agentSearch, agentSearchStreaming } from '../services/search-agent';

const router = Router();

// Timeout for search requests (90 seconds for agent processing)
const SEARCH_TIMEOUT_MS = 90000;

/**
 * GET /api/search
 * Natural language search over photos using agentic search with tool calls
 * Returns final results (non-streaming) - internally uses streaming implementation
 * 
 * Query params:
 *   - q: search query (required)
 *   - deviceId: device identifier (optional)
 *   - maxResults: max number of results (optional, default 10)
 */
router.get('/', async (req, res) => {
  const requestStartTime = Date.now();
  
  try {
    const query = req.query.q as string;
    const deviceId = req.query.deviceId as string | undefined;
    const maxResults = req.query.maxResults 
      ? parseInt(req.query.maxResults as string) 
      : 10;

    // Validate query
    if (!query || query.trim().length === 0) {
      console.log('❌ Search rejected: empty query');
      return res.status(400).json({
        success: false,
        error: 'Query parameter "q" is required',
        results: [],
        total: 0
      });
    }

    console.log(`\n📱 Search request from ${deviceId || 'unknown device'}`);
    console.log(`   Query: "${query}"`);
    console.log(`   Timeout set to: ${SEARCH_TIMEOUT_MS}ms`);

    // Create timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error('Search timeout - agent took too long to respond'));
      }, SEARCH_TIMEOUT_MS);
    });

    // Race between search and timeout
    const response = await Promise.race([
      agentSearch({
        query: query.trim(),
        deviceId,
        maxResults
      }),
      timeoutPromise
    ]);

    const requestTime = Date.now() - requestStartTime;
    console.log(`✅ Search request completed in ${requestTime}ms`);

    // Return results
    return res.json(response);

  } catch (error: any) {
    const requestTime = Date.now() - requestStartTime;
    
    // Check if this was a timeout error
    if (error.message?.includes('timeout')) {
      console.error(`⏰ Search timeout after ${requestTime}ms:`, error.message);
      return res.status(504).json({
        success: false,
        error: 'Search timed out. The agent took too long to process your query. Try a simpler search or check server logs.',
        results: [],
        total: 0,
        timeout: true
      });
    }
    
    console.error(`❌ Search endpoint error after ${requestTime}ms:`, error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      results: [],
      total: 0
    });
  }
});

/**
 * GET /api/search/stream
 * Streaming version of the search endpoint
 * Returns Server-Sent Events (SSE) with progressive updates
 * 
 * Event types:
 *   - status: Agent status updates
 *   - tool-call: When the agent calls a tool
 *   - partial-results: Intermediate results as they come in
 *   - text-delta: Agent reasoning text chunks
 *   - complete: Final results with all data
 *   - error: Error occurred
 * 
 * Query params:
 *   - q: search query (required)
 *   - deviceId: device identifier (optional)
 *   - maxResults: max number of results (optional, default 10)
 */
router.get('/stream', async (req, res) => {
  const requestStartTime = Date.now();
  
  try {
    const query = req.query.q as string;
    const deviceId = req.query.deviceId as string | undefined;
    const maxResults = req.query.maxResults 
      ? parseInt(req.query.maxResults as string) 
      : 10;

    // Validate query
    if (!query || query.trim().length === 0) {
      console.log('❌ Stream search rejected: empty query');
      return res.status(400).json({
        success: false,
        error: 'Query parameter "q" is required'
      });
    }

    console.log(`\n📱 Streaming search request from ${deviceId || 'unknown device'}`);
    console.log(`   Query: "${query}"`);

    // Set headers for Server-Sent Events
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Start streaming
    const stream = agentSearchStreaming({
      query: query.trim(),
      deviceId,
      maxResults
    });

    for await (const chunk of stream) {
      // Send each chunk as an SSE event
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      
      // If this is the complete event, end the stream
      if (chunk.type === 'complete' || chunk.type === 'error') {
        res.end();
        break;
      }
    }

    const requestTime = Date.now() - requestStartTime;
    console.log(`✅ Streaming search completed in ${requestTime}ms`);

  } catch (error: any) {
    const requestTime = Date.now() - requestStartTime;
    console.error(`❌ Streaming search error after ${requestTime}ms:`, error);
    
    // Send error as SSE event
    res.write(`data: ${JSON.stringify({
      type: 'error',
      error: error.message || 'Internal server error',
      timestamp: Date.now() - requestStartTime
    })}\n\n`);
    res.end();
  }
});

export default router;
