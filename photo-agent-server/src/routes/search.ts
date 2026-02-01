import { Router } from 'express';
import { agentSearch } from '../services/search-agent';

const router = Router();

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
  try {
    const query = req.query.q as string;
    const deviceId = req.query.deviceId as string | undefined;
    const maxResults = req.query.maxResults 
      ? parseInt(req.query.maxResults as string) 
      : 10;

    // Validate query
    if (!query || query.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Query parameter "q" is required',
        results: [],
        total: 0
      });
    }

    console.log(`\n📱 Search request from ${deviceId || 'unknown device'}`);

    // Execute agent search
    const response = await agentSearch({
      query: query.trim(),
      deviceId,
      maxResults
    });

    // Return results
    return res.json(response);

  } catch (error: any) {
    console.error('Search endpoint error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      results: [],
      total: 0
    });
  }
});

export default router;
