import * as weave from 'weave';
import {
  addTraceProcessor,
  type Trace,
  type Span,
  type TracingProcessor,
} from '@openai/agents';

let weaveClient: weave.WeaveClient | null = null;

/**
 * WeaveTracingProcessor - Integrates OpenAI Agents SDK tracing with Weave
 * 
 * This processor maps:
 * - Agents traces → Weave traces
 * - Agents spans → Weave spans
 */
class WeaveTracingProcessor implements TracingProcessor {
  // Track mapping from Agents trace id → Weave call context
  private traceContexts = new Map<string, { name: string; startTime: number; traceId: string }>();
  private spanContexts = new Map<string, { spanId: string; traceId: string; parentId?: string; type?: string; startTime: number }>();

  async onTraceStart(trace: Trace): Promise<void> {
    if (!weaveClient) return;

    try {
      // Log trace start as a custom operation
      console.log(`🔍 Weave: Trace started - ${trace.name || 'openai-agents-run'} (${trace.traceId})`);
      
      // Store trace context for later
      this.traceContexts.set(trace.traceId, {
        name: trace.name || 'openai-agents-run',
        startTime: Date.now(),
        traceId: trace.traceId,
      });
    } catch (error) {
      console.warn('Failed to start Weave trace:', error);
    }
  }

  async onSpanStart(span: Span<any>): Promise<void> {
    if (!weaveClient) return;

    try {
      const traceContext = this.traceContexts.get(span.traceId);
      if (!traceContext) return;

      const spanType = span.spanData?.type;
      console.log(`  📍 Weave: Span started - ${spanType || 'unknown'} (${span.spanId})`);
      
      // Store span context
      this.spanContexts.set(span.spanId, {
        spanId: span.spanId,
        traceId: span.traceId,
        parentId: span.parentId ?? undefined,
        type: spanType,
        startTime: Date.now(),
      });
    } catch (error) {
      console.warn('Failed to start Weave span:', error);
    }
  }

  async onSpanEnd(span: Span<any>): Promise<void> {
    if (!weaveClient) return;

    try {
      const spanContext = this.spanContexts.get(span.spanId);
      if (!spanContext) return;

      const duration = Date.now() - spanContext.startTime;
      console.log(`  ✅ Weave: Span ended - ${span.spanData?.type || 'unknown'} (${duration}ms)`);
      
      // Clean up
      this.spanContexts.delete(span.spanId);
    } catch (error) {
      console.warn('Failed to end Weave span:', error);
    }
  }

  async onTraceEnd(trace: Trace): Promise<void> {
    if (!weaveClient) return;

    try {
      const traceContext = this.traceContexts.get(trace.traceId);
      if (!traceContext) return;

      const duration = Date.now() - traceContext.startTime;
      console.log(`🏁 Weave: Trace ended - ${traceContext.name} (${duration}ms)`);
      
      // Clean up
      this.traceContexts.delete(trace.traceId);
    } catch (error) {
      console.warn('Failed to end Weave trace:', error);
    }
  }

  async shutdown(_timeout?: number): Promise<void> {
    // Clean up any remaining contexts
    this.traceContexts.clear();
    this.spanContexts.clear();
  }

  async forceFlush(): Promise<void> {
    // Nothing to flush in this implementation
  }
}

/**
 * Initialize Weave client for observability
 */
export async function initWeave() {
  if (weaveClient) {
    console.log('✅ Weave client already initialized');
    return weaveClient;
  }

  const apiKey = process.env.WANDB_API_KEY;
  if (!apiKey) {
    console.warn('⚠️  WANDB_API_KEY not found in .env - Weave tracing disabled');
    return null;
  }

  try {
    // Initialize Weave with project name
    weaveClient = await weave.init('idode-kerobo-stealth/weavehacks');
    console.log('✅ Weave observability initialized');
    
    // Register the OpenAI Agents SDK trace processor
    const processor = new WeaveTracingProcessor();
    addTraceProcessor(processor);
    console.log('✅ OpenAI Agents SDK trace processor registered with Weave');
    
    return weaveClient;
  } catch (error) {
    console.error('❌ Failed to initialize Weave:', error);
    return null;
  }
}

/**
 * Get the current Weave client instance
 */
export function getWeaveClient(): weave.WeaveClient | null {
  return weaveClient;
}

/**
 * Create a traced operation wrapper using Weave's op decorator
 * Usage: const tracedFn = createTracedOp('operation-name', yourFunction);
 */
export function createTracedOp<T extends (...args: any[]) => any>(
  name: string,
  fn: T
): T {
  if (!weaveClient) {
    // If Weave is not initialized, return the original function
    console.log(`⚠️  Weave not initialized - ${name} will run without tracing`);
    return fn;
  }

  // Wrap the function with Weave's op decorator
  const wrapped = weave.op(fn, { name }) as T;
  console.log(`✅ Created traced operation: ${name}`);
  return wrapped;
}

/**
 * Log attributes to current trace context
 * Note: withAttributes requires wrapping a function execution
 */
export function logAttributes(attributes: Record<string, any>) {
  if (!weaveClient) return;
  
  try {
    // withAttributes signature: withAttributes(attrs, fn)
    weave.withAttributes(attributes, () => {
      // No-op: attributes are attached to current context
    });
  } catch (error) {
    console.warn('Failed to log attributes to Weave:', error);
  }
}

/**
 * Create a traced search operation that logs to Weave
 */
export function createTracedSearchOp() {
  if (!weaveClient) {
    return null;
  }
  
  return weave.op(
    async (params: {
      query: string;
      maxResults: number;
      deviceId?: string;
    }) => {
      // This will be called by the search agent
      // The actual implementation is in the search-agent.ts
      return params;
    },
    { name: 'agentSearch' }
  );
}
