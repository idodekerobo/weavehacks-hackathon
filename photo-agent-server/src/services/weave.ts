import * as weave from 'weave';

let weaveClient: weave.WeaveClient | null = null;

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
    weaveClient = await weave.init('photo-agent');
    console.log('✅ Weave observability initialized');
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
 * Create a traced operation wrapper
 * Usage: const tracedFn = createTracedOp('operation-name', yourFunction);
 */
export function createTracedOp<T extends (...args: any[]) => any>(
  name: string,
  fn: T
): T {
  if (!weaveClient) {
    // If Weave is not initialized, return the original function
    return fn;
  }

  // Wrap the function with Weave's op decorator
  return weave.op(fn, { name }) as T;
}

/**
 * Log attributes to current trace
 * Note: withAttributes requires wrapping a function execution
 * Signature: withAttributes(attrs, fn)
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
