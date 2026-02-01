/**
 * Search Agent - OpenAI Agents SDK Implementation
 * 
 * This agent uses the OpenAI Agents SDK for orchestration while keeping
 * Ollama for embeddings (nomic-embed-text) and image analysis (qwen).
 * 
 * Migration from: Vercel AI SDK ToolLoopAgent + ollama-ai-provider
 * Migration to: OpenAI Agents SDK + OpenAI models for reasoning
 */

import { Agent, run, setDefaultOpenAIKey, type RunStreamEvent } from '@openai/agents';
import { searchTools } from './search-tools';
import { logAttributes } from './weave';

// Model configuration
// OpenAI for agent reasoning, Ollama for embeddings (in search-tools.ts)
const AGENT_MODEL = 'gpt-4o-mini'; // Cost-effective for tool calling
const MAX_TURNS = 5;

// Initialize OpenAI API key
const initializeOpenAI = () => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required for the search agent');
  }
  setDefaultOpenAIKey(apiKey);
};

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

1. search_by_embedding - Use for semantic/conceptual searches (e.g., "red flowers", "people at parties")
2. search_by_text - Use for exact text matches (e.g., specific words from flyers or screenshots)
3. filter_by_intent - Use to filter by type (event_flyer, general_photo, other)
4. filter_by_date_range - Use for time-based searches (e.g., "this week", "last 7 days")
5. filter_by_location - Use for location-based searches (e.g., "photos in San Francisco")
6. combine_results - Use to merge and deduplicate results from multiple searches

STRATEGY:
- Start with semantic search (search_by_embedding) for most queries
- Add text search if the query has specific keywords
- Apply filters (intent, date, location) to refine results
- Combine and deduplicate at the end
- You can call multiple tools, but try to be efficient (aim for 2-3 tool calls)

IMPORTANT:
- Always return results in a helpful format
- Include the photoLibraryId for each result (iOS needs this to fetch images)
- Be conversational and helpful in your reasoning
- After finding results, summarize what you found for the user`;

// Create the search agent instance
const createSearchAgent = () => {
  initializeOpenAI();
  
  return new Agent({
    name: 'PhotoSearchAgent',
    model: AGENT_MODEL,
    instructions: SYSTEM_PROMPT,
    tools: searchTools,
  });
};

// Singleton agent instance for reuse
let searchAgent: Agent | null = null;

const getSearchAgent = () => {
  if (!searchAgent) {
    console.log(`   🔧 Creating new OpenAI Agent with model: ${AGENT_MODEL}`);
    searchAgent = createSearchAgent();
  }
  return searchAgent;
};

// Reset agent (useful when config changes)
export const resetSearchAgent = () => {
  searchAgent = null;
  console.log('   🔄 Search agent reset');
};

/**
 * Streaming agent-based search implementation
 * Uses OpenAI Agents SDK for agent loop orchestration
 * Returns an async generator that yields progressive updates
 */
export async function* agentSearchStreaming(request: SearchRequest): AsyncGenerator<SearchStreamEvent> {
  const startTime = Date.now();
  const { query, maxResults = 10 } = request;
  
  console.log('\n🤖 Starting streaming agent search (OpenAI Agents SDK)...');
  console.log(`   Query: "${query}"`);
  console.log(`   Max results: ${maxResults}`);
  console.log(`   Model: ${AGENT_MODEL}`);
  console.log(`   Max turns: ${MAX_TURNS}`);
  
  // Log attributes to Weave
  logAttributes({
    userQuery: query,
    maxResults,
    deviceId: request.deviceId || 'unknown',
    model: AGENT_MODEL,
    streaming: true,
    startTime: new Date(startTime).toISOString()
  });
  
  try {
    yield {
      type: 'status',
      message: 'Agent started processing...',
      timestamp: Date.now() - startTime
    };

    // Get the reusable agent instance
    const agent = getSearchAgent();

    // Build the user prompt
    const userPrompt = `Find photos matching: "${query}"

Return up to ${maxResults} results. Be smart about which tools to use.`;

    console.log('   📤 Starting streaming request via OpenAI Agents SDK...');
    
    // Use the streaming run
    const streamResult = await run(agent, userPrompt, {
      stream: true,
      maxTurns: MAX_TURNS,
    });

    const toolCalls: string[] = [];
    let allResults: any[] = [];
    let reasoningText = '';

    // Process streaming events
    for await (const event of streamResult) {
      const streamEvent = event as RunStreamEvent;
      
      if (streamEvent.type === 'agent_updated_stream_event') {
        // Agent state changed
        console.log(`   📍 Agent updated`);
      } else if (streamEvent.type === 'raw_model_stream_event') {
        // Raw model output - capture text deltas
        const data = streamEvent.data as any;
        if (data?.delta?.content) {
          // Handle content deltas
          for (const content of data.delta.content) {
            if (content.type === 'text' && content.text) {
              reasoningText += content.text;
              yield {
                type: 'text-delta',
                text: content.text,
                timestamp: Date.now() - startTime
              };
            }
          }
        }
      } else if (streamEvent.type === 'run_item_stream_event') {
        const item = streamEvent.item;
        
        if (item.type === 'tool_call_item') {
          // Tool was called - get tool name from rawItem
          const rawItem = item.rawItem as any;
          const toolName = rawItem?.name || rawItem?.function?.name || 'unknown';
          toolCalls.push(toolName);
          console.log(`   🔧 Tool call: ${toolName}`);
          
          yield {
            type: 'tool-call',
            toolName,
            args: rawItem?.arguments || rawItem?.function?.arguments || {},
            timestamp: Date.now() - startTime
          };
        } else if (item.type === 'tool_call_output_item') {
          // Tool returned results
          console.log(`   ✅ Tool result received`);
          
          // Extract results from tool output
          try {
            const output = typeof item.output === 'string' 
              ? JSON.parse(item.output) 
              : item.output;
            
            if (output?.results && Array.isArray(output.results)) {
              console.log(`      → Got ${output.results.length} results`);
              allResults = allResults.concat(output.results);
              
              yield {
                type: 'partial-results',
                count: output.results.length,
                total: allResults.length,
                timestamp: Date.now() - startTime
              };
            }
          } catch (e) {
            // Output might not be JSON
          }
        } else if (item.type === 'message_output_item') {
          // Final message from agent
          const rawItem = item.rawItem as any;
          const content = rawItem?.content;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === 'output_text' && block.text) {
                reasoningText += block.text;
              }
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
    
    console.log(`\n   ✅ OpenAI Agents SDK search complete!`);
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
    console.error(`\n   ❌ OpenAI Agents SDK search failed after ${executionTime}ms`);
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
 * Non-streaming wrapper for clients that don't support SSE
 */
export async function agentSearch(request: SearchRequest): Promise<SearchResponse> {
  const startTime = Date.now();
  const { query, maxResults = 10 } = request;
  
  console.log('\n🤖 Starting non-streaming agent search (OpenAI Agents SDK)...');
  console.log(`   Query: "${query}"`);
  console.log(`   Max results: ${maxResults}`);
  console.log(`   Model: ${AGENT_MODEL}`);
  
  // Log attributes to Weave
  logAttributes({
    userQuery: query,
    maxResults,
    deviceId: request.deviceId || 'unknown',
    model: AGENT_MODEL,
    streaming: false,
    startTime: new Date(startTime).toISOString()
  });
  
  try {
    // Get the reusable agent instance
    const agent = getSearchAgent();

    // Build the user prompt
    const userPrompt = `Find photos matching: "${query}"

Return up to ${maxResults} results. Be smart about which tools to use.`;

    console.log('   📤 Starting request via OpenAI Agents SDK...');
    
    // Run the agent (non-streaming)
    const result = await run(agent, userPrompt, {
      maxTurns: MAX_TURNS,
    });

    // Extract tool calls and results from the run
    const toolCalls: string[] = [];
    let allResults: any[] = [];

    // Process all items from the run
    for (const item of result.newItems) {
      if (item.type === 'tool_call_item') {
        const rawItem = item.rawItem as any;
        const toolName = rawItem?.name || rawItem?.function?.name || 'unknown';
        toolCalls.push(toolName);
      } else if (item.type === 'tool_call_output_item') {
        try {
          const output = typeof item.output === 'string' 
            ? JSON.parse(item.output) 
            : item.output;
          
          if (output?.results && Array.isArray(output.results)) {
            allResults = allResults.concat(output.results);
          }
        } catch (e) {
          // Output might not be JSON
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
    
    // Get the final output text
    const reasoningText = result.finalOutput || '';
    
    console.log(`\n   ✅ OpenAI Agents SDK search complete!`);
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
      streaming: false
    });

    return {
      success: true,
      results: formattedResults,
      total: formattedResults.length,
      agentSteps: {
        toolCalls,
        reasoning: reasoningText || 'Search completed',
        iterations: toolCalls.length
      }
    };

  } catch (error: any) {
    const executionTime = Date.now() - startTime;
    console.error(`\n   ❌ OpenAI Agents SDK search failed after ${executionTime}ms`);
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
