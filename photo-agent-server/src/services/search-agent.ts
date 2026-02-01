import { ToolLoopAgent, stepCountIs } from 'ai';
import { ollama } from 'ollama-ai-provider-v2';
import { 
  searchByEmbedding, 
  searchByText, 
  filterByIntent,
  filterByDateRange,
  filterByLocation,
  combineResults
} from './search-tools';
import { logAttributes } from './weave';

// Model configuration
// Use Mistral for agentic search (better function calling) 
// Use Qwen3-VL for vision tasks (image analysis) - e.g., 'qwen3-vl:8b'
const AGENT_MODEL = 'mistral:instruct';
const MAX_ITERATIONS = 5;

// Fallback: Direct search without agent (for testing/debugging)
const USE_AGENT = true; // Set to true to use agent, false for direct search

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

// Streaming event types for progressive updates
export type SearchStreamEvent = 
  | { type: 'status'; message: string; timestamp: number }
  | { type: 'tool-call'; toolName: string; args: any; timestamp: number }
  | { type: 'partial-results'; count: number; total: number; timestamp: number }
  | { type: 'text-delta'; text: string; timestamp: number }
  | { type: 'complete'; results: SearchResultItem[]; total: number; toolCalls: string[]; reasoning: string; executionTime: number; timestamp: number }
  | { type: 'error'; error: string; timestamp: number };

// System prompt for the search agent
const SYSTEM_PROMPT = `You are a helpful search agent for a photo library system.

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

/**
 * Create the search agent instance using ToolLoopAgent
 * This is a reusable agent that can be called multiple times
 */
const createSearchAgent = () => new ToolLoopAgent({
  model: ollama(AGENT_MODEL),
  instructions: SYSTEM_PROMPT,
  tools: {
    searchByEmbedding,
    searchByText,
    filterByIntent,
    filterByDateRange,
    filterByLocation,
    combineResults
  },
  stopWhen: stepCountIs(MAX_ITERATIONS),
  experimental_telemetry: {
    isEnabled: true,
  },
});

// Singleton agent instance for reuse
let searchAgent: ReturnType<typeof createSearchAgent> | null = null;

const getSearchAgent = () => {
  if (!searchAgent) {
    searchAgent = createSearchAgent();
  }
  return searchAgent;
};

/**
 * Streaming agent-based search implementation
 * Uses Vercel AI SDK ToolLoopAgent for agent loop orchestration
 * Returns an async generator that yields progressive updates
 */
export async function* agentSearchStreaming(request: SearchRequest): AsyncGenerator<SearchStreamEvent> {
  const startTime = Date.now();
  const { query, maxResults = 10 } = request;
  
  console.log('\n🤖 Starting streaming agent search (ToolLoopAgent)...');
  console.log(`   Query: "${query}"`);
  console.log(`   Max results: ${maxResults}`);
  console.log(`   Model: ${AGENT_MODEL}`);
  console.log(`   Max iterations: ${MAX_ITERATIONS}`);
  console.log(`   Mode: ${USE_AGENT ? 'AGENT' : 'DIRECT (no agent)'}`);
  
  // Log attributes to Weave
  logAttributes({
    userQuery: query,
    maxResults,
    deviceId: request.deviceId || 'unknown',
    model: AGENT_MODEL,
    useAgent: USE_AGENT,
    streaming: true,
    startTime: new Date(startTime).toISOString()
  });
  
  try {
    // FALLBACK MODE: Direct search without agent
    if (!USE_AGENT) {
      console.log('   🔧 Using direct search (bypassing agent)...');
      
      yield {
        type: 'status',
        message: 'Using direct embedding search...',
        timestamp: Date.now() - startTime
      };
      
      // Directly call searchByEmbedding tool
      const searchResult = await (searchByEmbedding as any).execute(
        { query, topK: maxResults },
        {}
      );
      
      const executionTime = Date.now() - startTime;
      
      console.log(`\n   ✅ Direct search complete!`);
      console.log(`   📊 Results: ${searchResult.results.length}`);
      console.log(`   ⏱️  Total time: ${executionTime}ms\n`);
      
      logAttributes({
        toolCallsUsed: ['searchByEmbedding'],
        resultsReturned: searchResult.results.length,
        executionTime,
        success: true,
        mode: 'direct'
      });
      
      yield {
        type: 'complete',
        results: searchResult.results,
        total: searchResult.results.length,
        toolCalls: ['searchByEmbedding (direct)'],
        reasoning: 'Direct embedding search without agent',
        executionTime,
        timestamp: Date.now() - startTime
      };
      return;
    }
    
    // AGENT MODE: Full agentic search with ToolLoopAgent streaming
    const userPrompt = `Find photos matching: "${query}"

Return up to ${maxResults} results. Be smart about which tools to use.`;

    console.log('   📤 Starting streaming request via ToolLoopAgent...');
    
    yield {
      type: 'status',
      message: 'Agent started processing...',
      timestamp: Date.now() - startTime
    };

    // Get the reusable agent instance
    const agent = getSearchAgent();

    // Stream the agent response
    const streamResult = await agent.stream({
      prompt: userPrompt,
      onStepFinish: (step: any) => {
        console.log(`   📍 Step finished:`, {
          toolCalls: step.toolCalls?.length || 0,
          text: step.text?.slice(0, 50) || 'none'
        });
      },
    });

    let toolCallCount = 0;
    let allResults: any[] = [];
    const toolCalls: string[] = [];
    let reasoningText = '';

    // Stream tool calls and results as they happen
    for await (const part of streamResult.fullStream) {
      if (part.type === 'tool-call') {
        toolCallCount++;
        toolCalls.push(part.toolName);
        console.log(`   🔧 Tool call ${toolCallCount}: ${part.toolName}`);
        
        // AI SDK 6 uses 'input' instead of 'args'
        const toolArgs = (part as any).args ?? (part as any).input;
        yield {
          type: 'tool-call',
          toolName: part.toolName,
          args: toolArgs,
          timestamp: Date.now() - startTime
        };
      } else if (part.type === 'tool-result') {
        console.log(`   ✅ Tool result received`);
        
        // Extract results from tool result - use 'output' property in AI SDK 6
        const toolOutput = (part as any).result ?? (part as any).output;
        if (toolOutput && typeof toolOutput === 'object') {
          const resultData = toolOutput as any;
          if (resultData.results && Array.isArray(resultData.results)) {
            console.log(`      → Got ${resultData.results.length} results`);
            allResults = allResults.concat(resultData.results);
            
            // Yield intermediate results
            yield {
              type: 'partial-results',
              count: resultData.results.length,
              total: allResults.length,
              timestamp: Date.now() - startTime
            };
          }
        }
      } else if (part.type === 'text-delta') {
        // Agent reasoning text - AI SDK 6 uses 'text' instead of 'textDelta'
        const delta = (part as any).textDelta ?? (part as any).text ?? '';
        reasoningText += delta;
        
        yield {
          type: 'text-delta',
          text: delta,
          timestamp: Date.now() - startTime
        };
      }
    }

    // Deduplicate results
    console.log(`   🔀 Deduplicating ${allResults.length} total results...`);
    const seenIds = new Set<string>();
    const uniqueResults = allResults.filter(r => {
      if (seenIds.has(r.id)) {
        return false;
      }
      seenIds.add(r.id);
      return true;
    });
    console.log(`   ✅ ${uniqueResults.length} unique results after deduplication`);

    // Take top N results
    const finalResults = uniqueResults.slice(0, maxResults);

    // Format results for iOS
    const formattedResults: SearchResultItem[] = finalResults.map(r => ({
      id: r.id,
      photoLibraryId: r.photoLibraryId,
      intentType: r.intentType || null,
      summary: r.summary || null,
      ocrText: r.ocrText || null,
      confidence: r.confidence || null,
      creationDate: r.creationDate || null,
      filename: r.filename || null
    }));

    const executionTime = Date.now() - startTime;
    
    console.log(`\n   ✅ ToolLoopAgent search complete!`);
    console.log(`   📊 Final results: ${formattedResults.length}`);
    console.log(`   🔧 Tools used: ${toolCalls.join(', ') || 'none'}`);
    console.log(`   ⏱️  Total time: ${executionTime}ms`);
    console.log(`   🤖 Agent reasoning: ${reasoningText.slice(0, 100) || 'none'}...\n`);

    // Log to Weave
    logAttributes({
      toolCallsUsed: toolCalls,
      resultsReturned: formattedResults.length,
      executionTime,
      agentReasoning: reasoningText || 'none',
      success: true,
      streaming: true
    });

    // Yield final results
    yield {
      type: 'complete',
      results: formattedResults,
      total: formattedResults.length,
      toolCalls,
      reasoning: reasoningText || 'Search completed',
      executionTime,
      timestamp: Date.now() - startTime
    };

  } catch (error: any) {
    const executionTime = Date.now() - startTime;
    console.error(`\n   ❌ ToolLoopAgent search failed after ${executionTime}ms`);
    console.error(`   Error type: ${error.name || 'Unknown'}`);
    console.error(`   Error message: ${error.message}`);
    if (error.stack) {
      console.error(`   Stack trace:\n${error.stack.split('\n').slice(0, 5).join('\n')}`);
    }
    
    logAttributes({
      error: error.message,
      errorType: error.name,
      executionTime,
      success: false,
      streaming: true
    });

    yield {
      type: 'error',
      error: error.message || 'Search failed',
      timestamp: Date.now() - startTime
    };
  }
}

/**
 * Non-streaming wrapper that uses ToolLoopAgent.generate()
 * Useful for clients that don't support SSE
 */
export async function agentSearch(request: SearchRequest): Promise<SearchResponse> {
  const startTime = Date.now();
  const { query, maxResults = 10 } = request;
  
  console.log('\n🤖 Starting non-streaming agent search (ToolLoopAgent)...');
  console.log(`   Query: "${query}"`);
  console.log(`   Max results: ${maxResults}`);
  console.log(`   Model: ${AGENT_MODEL}`);
  
  // Log attributes to Weave
  logAttributes({
    userQuery: query,
    maxResults,
    deviceId: request.deviceId || 'unknown',
    model: AGENT_MODEL,
    useAgent: USE_AGENT,
    streaming: false,
    startTime: new Date(startTime).toISOString()
  });
  
  try {
    // FALLBACK MODE: Direct search without agent
    if (!USE_AGENT) {
      console.log('   🔧 Using direct search (bypassing agent)...');
      
      const searchResult = await (searchByEmbedding as any).execute(
        { query, topK: maxResults },
        {}
      );
      
      const executionTime = Date.now() - startTime;
      
      console.log(`\n   ✅ Direct search complete!`);
      console.log(`   📊 Results: ${searchResult.results.length}`);
      console.log(`   ⏱️  Total time: ${executionTime}ms\n`);
      
      logAttributes({
        toolCallsUsed: ['searchByEmbedding'],
        resultsReturned: searchResult.results.length,
        executionTime,
        success: true,
        mode: 'direct'
      });
      
      return {
        success: true,
        results: searchResult.results,
        total: searchResult.results.length,
        agentSteps: {
          toolCalls: ['searchByEmbedding (direct)'],
          reasoning: 'Direct embedding search without agent',
          iterations: 1
        }
      };
    }
    
    // AGENT MODE: Use ToolLoopAgent.generate()
    const userPrompt = `Find photos matching: "${query}"

Return up to ${maxResults} results. Be smart about which tools to use.`;

    console.log('   📤 Starting request via ToolLoopAgent.generate()...');
    
    const agent = getSearchAgent();
    const toolCalls: string[] = [];
    
    const result = await agent.generate({
      prompt: userPrompt,
      onStepFinish: (step: any) => {
        console.log(`   📍 Step finished:`, {
          toolCalls: step.toolCalls?.length || 0,
          text: step.text?.slice(0, 50) || 'none'
        });
        // Collect tool calls from each step
        if (step.toolCalls) {
          for (const tc of step.toolCalls) {
            toolCalls.push(tc.toolName);
          }
        }
      },
    });
    
    // Extract all results from tool results across all steps
    let allResults: any[] = [];
    for (const step of result.steps) {
      if (step.toolResults) {
        for (const toolResult of step.toolResults) {
          // Use 'output' property in AI SDK 6, fallback to 'result' for compatibility
          const output = (toolResult as any).result ?? (toolResult as any).output;
          if (output && typeof output === 'object') {
            const resultData = output as any;
            if (resultData.results && Array.isArray(resultData.results)) {
              allResults = allResults.concat(resultData.results);
            }
          }
        }
      }
    }
    
    // Deduplicate results
    console.log(`   🔀 Deduplicating ${allResults.length} total results...`);
    const seenIds = new Set<string>();
    const uniqueResults = allResults.filter(r => {
      if (seenIds.has(r.id)) {
        return false;
      }
      seenIds.add(r.id);
      return true;
    });
    console.log(`   ✅ ${uniqueResults.length} unique results after deduplication`);

    // Take top N results
    const finalResults = uniqueResults.slice(0, maxResults);

    // Format results for iOS
    const formattedResults: SearchResultItem[] = finalResults.map(r => ({
      id: r.id,
      photoLibraryId: r.photoLibraryId,
      intentType: r.intentType || null,
      summary: r.summary || null,
      ocrText: r.ocrText || null,
      confidence: r.confidence || null,
      creationDate: r.creationDate || null,
      filename: r.filename || null
    }));

    const executionTime = Date.now() - startTime;
    
    console.log(`\n   ✅ ToolLoopAgent.generate() complete!`);
    console.log(`   📊 Final results: ${formattedResults.length}`);
    console.log(`   🔧 Tools used: ${toolCalls.join(', ') || 'none'}`);
    console.log(`   ⏱️  Total time: ${executionTime}ms`);
    console.log(`   🤖 Agent reasoning: ${result.text?.slice(0, 100) || 'none'}...\n`);

    // Log to Weave
    logAttributes({
      toolCallsUsed: toolCalls,
      iterationCount: result.steps?.length || 0,
      resultsReturned: formattedResults.length,
      executionTime,
      agentReasoning: result.text || 'none',
      success: true,
      streaming: false
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
    const executionTime = Date.now() - startTime;
    console.error(`\n   ❌ ToolLoopAgent.generate() failed after ${executionTime}ms`);
    console.error(`   Error type: ${error.name || 'Unknown'}`);
    console.error(`   Error message: ${error.message}`);
    if (error.stack) {
      console.error(`   Stack trace:\n${error.stack.split('\n').slice(0, 5).join('\n')}`);
    }
    
    logAttributes({
      error: error.message,
      errorType: error.name,
      executionTime,
      success: false,
      streaming: false
    });

    return {
      success: false,
      results: [],
      total: 0,
      error: error.message || 'Search failed'
    };
  }
}
