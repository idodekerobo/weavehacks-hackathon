import { generateText } from 'ai';
import { ollama } from 'ollama-ai-provider';
import { 
  searchByEmbedding, 
  searchByText, 
  filterByIntent,
  filterByDateRange,
  filterByLocation,
  combineResults
} from './search-tools';
import { createTracedOp, logAttributes } from './weave';

// Use the same model as image analysis for consistency
const AGENT_MODEL = 'qwen3-vl:8b';
const MAX_ITERATIONS = 5;

export interface SearchRequest {
  query: string;
  deviceId?: string;
  maxResults?: number;
}

export interface SearchResponse {
  success: boolean;
  results: SearchResultItem[];
  total: number;
  agentSteps?: {
    toolCalls: string[];
    reasoning: string;
    iterations: number;
  };
  error?: string;
}

export interface SearchResultItem {
  id: string;
  photoLibraryId: string;
  intentType: string | null;
  summary: string | null;
  ocrText: string | null;
  confidence: number | null;
  creationDate: string | null;
  filename: string | null;
}

/**
 * Agent-based search implementation
 * Uses Vercel AI SDK with Ollama provider for tool calling
 */
const _agentSearchImpl = async (request: SearchRequest): Promise<SearchResponse> => {
  const startTime = Date.now();
  const { query, maxResults = 10 } = request;
  
  console.log('\n🤖 Starting agent search...');
  console.log(`   Query: "${query}"`);
  console.log(`   Max results: ${maxResults}`);
  
  // Log attributes to Weave
  logAttributes({
    userQuery: query,
    maxResults,
    deviceId: request.deviceId || 'unknown'
  });
  
  try {
    // System prompt for the search agent
    const systemPrompt = `You are a helpful search agent for a photo library system.

Your job is to help users find photos using natural language queries. You have access to several search tools:

1. searchByEmbedding - Use for semantic/conceptual searches (e.g., "red flowers", "people at parties")
2. searchByText - Use for exact text matches (e.g., specific words from flyers or screenshots)
3. filterByIntent - Use to filter by type (event_flyer, general_photo, other)
4. filterByDateRange - Use for time-based searches (e.g., "this week", "last 7 days")
5. filterByLocation - Use for location-based searches (e.g., "photos in San Francisco")
6. combineResults - Use to merge and deduplicate results from multiple searches

STRATEGY:
- Start with semantic search (searchByEmbedding) for most queries
- Add text search if the query has specific keywords
- Apply filters (intent, date, location) to refine results
- Combine and deduplicate at the end
- You can call multiple tools, but try to be efficient (aim for 2-3 tool calls)

IMPORTANT:
- Always return results in JSON format
- Include the photoLibraryId for each result (iOS needs this to fetch images)
- Be conversational and helpful in your reasoning`;

    const userPrompt = `Find photos matching: "${query}"

Return up to ${maxResults} results. Be smart about which tools to use.`;

    // Run the agent with tool calling
    let result;
    try {
      result = await generateText({
        model: ollama(AGENT_MODEL),
        system: systemPrompt,
        prompt: `Here is the user's prompt:\n${userPrompt}`,
        tools: {
          searchByEmbedding,
          searchByText,
          filterByIntent,
          filterByDateRange,
          filterByLocation,
          combineResults
        },
        maxSteps: MAX_ITERATIONS,
        experimental_telemetry: {
          isEnabled: true,
          metadata: {
            query: query,
            maxResults: maxResults,
            deviceId: request.deviceId || 'unknown',
          },
        },
        // Add these for debugging
        onStepFinish: (step) => {
          console.log(`   📍 Step ${step.stepType} finished:`, {
            stepType: step.stepType,
            toolCalls: step.toolCalls?.length || 0,
            text: step.text?.slice(0, 50) || 'none'
          });
        },
      });
      
      clearInterval(progressInterval);
    } catch (error) {
      clearInterval(progressInterval);
      throw error;
    }

    const ollamaTime = Date.now() - ollamaStartTime;
    console.log(`   ✅ Ollama responded in ${ollamaTime}ms`);

    // Log the raw response structure for debugging
    console.log(`   📊 Response steps: ${result.steps?.length || 0}`);
    console.log(`   📊 Tool calls: ${result.toolCalls?.length || 0}`);
    console.log(`   📊 Tool results: ${result.toolResults?.length || 0}`);
        maxSteps: MAX_ITERATIONS,
        experimental_telemetry: {
          isEnabled: true,
          metadata: {
            query: query,
            maxResults: maxResults,
            deviceId: request.deviceId || 'unknown',
          },
        },
        // Add these for debugging
        onStepFinish: (step) => {
          console.log(`   📍 Step ${step.stepType} finished:`, {
            stepType: step.stepType,
            toolCalls: step.toolCalls?.length || 0,
            text: step.text?.slice(0, 50) || 'none'
          });
        },
      });
      
      clearInterval(progressInterval);
    } catch (error) {
      clearInterval(progressInterval);
      throw error;
    }

    const ollamaTime = Date.now() - ollamaStartTime;
    console.log(`   ✅ Ollama responded in ${ollamaTime}ms`);

    // Log the raw response structure for debugging
    console.log(`   📊 Response steps: ${result.steps?.length || 0}`);
    console.log(`   📊 Tool calls: ${result.toolCalls?.length || 0}`);
    console.log(`   📊 Tool results: ${result.toolResults?.length || 0}`);

    // Extract tool calls for logging
    const toolCalls: string[] = [];
    let allResults: any[] = [];
    
    // Process tool results from the agent's execution
    if (result.toolCalls && result.toolCalls.length > 0) {
      for (const toolCall of result.toolCalls) {
        toolCalls.push(toolCall.toolName);
        console.log(`   🔧 Tool used: ${toolCall.toolName}`);
      }
    }

    // Extract results from tool results
    if (result.toolResults && result.toolResults.length > 0) {
      for (const toolResult of result.toolResults) {
        if (toolResult.result && typeof toolResult.result === 'object') {
          const resultData = toolResult.result as any;
          if (resultData.results && Array.isArray(resultData.results)) {
            allResults = allResults.concat(resultData.results);
          }
        }
      }
    }

    // Deduplicate results
    const seenIds = new Set<string>();
    const uniqueResults = allResults.filter(result => {
      if (seenIds.has(result.id)) {
        return false;
      }
      seenIds.add(result.id);
      return true;
    });

    // Take top N results
    const finalResults = uniqueResults.slice(0, maxResults);

    // Format results for iOS
    const formattedResults: SearchResultItem[] = finalResults.map(result => ({
      id: result.id,
      photoLibraryId: result.photoLibraryId,
      intentType: result.intentType || null,
      summary: result.summary || null,
      ocrText: result.ocrText || null,
      confidence: result.confidence || null,
      creationDate: result.creationDate || null,
      filename: result.filename || null
    }));

    const executionTime = Date.now() - startTime;
    
    console.log(`   ✅ Agent search complete`);
    console.log(`   Results: ${formattedResults.length}`);
    console.log(`   Tools used: ${toolCalls.join(', ') || 'none'}`);
    console.log(`   Time: ${executionTime}ms\n`);

    // Log to Weave
    logAttributes({
      toolCallsUsed: toolCalls,
      iterationCount: result.steps?.length || 0,
      resultsReturned: formattedResults.length,
      executionTime
    });

    return {
      success: true,
      results: formattedResults,
      total: formattedResults.length,
      agentSteps: {
        toolCalls,
        reasoning: result.text || 'Search completed',
        iterations: result.steps?.length || 0
      }
    };

  } catch (error: any) {
    console.error('❌ Agent search failed:', error);
    
    logAttributes({
      error: error.message,
      executionTime: Date.now() - startTime
    });

    return {
      success: false,
      results: [],
      total: 0,
      error: error.message || 'Search failed'
    };
  }
};

// Export traced version
export const agentSearch = createTracedOp('agentSearch', _agentSearchImpl);
