import { Router } from 'express';
import { agentSearch } from '../services/search-agent';

const router = Router();

// Timeout for search requests (90 seconds for agent processing)
const SEARCH_TIMEOUT_MS = 90000;

/**
 * GET /api/search
 * Natural language search over photos using agentic search with tool calls
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

export default router;
