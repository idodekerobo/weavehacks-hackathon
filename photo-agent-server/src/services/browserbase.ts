import { Stagehand as V3 } from '@browserbasehq/stagehand';
import { z } from 'zod';
import { createTracedOp, logAttributes } from './weave';
import { ExtractedEvent } from './event-extraction';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

const BROWSERBASE_API_KEY = process.env.BROWSERBASE_API_KEY;
const BROWSERBASE_PROJECT_ID = process.env.BROWSERBASE_PROJECT_ID;
const OLLAMA_BASE_URL = 'http://localhost:11434';
const VISION_MODEL = 'qwen3-vl:8b';

if (!BROWSERBASE_API_KEY || !BROWSERBASE_PROJECT_ID) {
  console.warn('⚠️  Browserbase credentials not configured - web search will be disabled');
}

/**
 * Search result from web search
 */
export interface EventSearchResult {
  url: string;
  title: string;
  snippet: string;
  screenshotPath: string;
  verified: boolean;
  confidence: number;
  sessionId?: string;
  recordingUrl?: string;
}

/**
 * Verification result comparing flyer to found event page
 */
interface VerificationResult {
  verified: boolean;
  confidence: number;
  reasoning: string;
}

/**
 * Search for canonical event page using Browserbase Stagehand
 */
const _searchForEventImpl = async (
  extractedEvent: ExtractedEvent,
  originalImageData: Buffer
): Promise<EventSearchResult | null> => {
  
  if (!BROWSERBASE_API_KEY || !BROWSERBASE_PROJECT_ID) {
    throw new Error('Browserbase credentials not configured');
  }

  logAttributes({
    operation: 'event_search',
    eventName: extractedEvent.eventName,
    location: extractedEvent.location,
    date: extractedEvent.date
  });

  let stagehand: V3 | null = null;
  
  try {
    // Initialize Stagehand with Browserbase
    console.log('🌐 Initializing Browserbase session...');
    
    stagehand = new V3({
      env: 'BROWSERBASE',
      apiKey: BROWSERBASE_API_KEY,
      projectId: BROWSERBASE_PROJECT_ID,
      verbose: 1 // Enable logging
    });

    await stagehand.init();
    
    const sessionId = stagehand.browserbaseSessionID;
    console.log(`✅ Browserbase session started: ${sessionId}`);
    
    logAttributes({
      sessionId,
      browserbaseUrl: `https://www.browserbase.com/sessions/${sessionId}`
    });

    // Get the page object
    const page = stagehand.context.pages()[0];

    // Build search query
    const searchQuery = `${extractedEvent.eventName} ${extractedEvent.location} ${extractedEvent.date} event`;
    console.log(`🔍 Searching for: "${searchQuery}"`);

    // Navigate to Google
    await page.goto('https://www.google.com', {
      waitUntil: 'networkidle'
    });

    // Perform search
    await stagehand.act(`search for "${searchQuery}"`);
    
    // Wait for results to load
    await page.waitForTimeout(2000);

    // Extract search results
    console.log('📊 Extracting search results...');
    
    const searchResultSchema = z.object({
      url: z.string(),
      title: z.string(),
      snippet: z.string()
    });

    // Use a type assertion to avoid deep type inference issues
    type SearchResult = { url: string; title: string; snippet: string };
    const arraySchema = z.array(searchResultSchema);
    
    const searchResults: SearchResult[] = await stagehand.extract(
      'extract the top 5 search result links, titles, and snippets. Return an array of objects.',
      arraySchema as any
    ) as any;

    if (!searchResults || searchResults.length === 0) {
      console.log('❌ No search results found');
      logAttributes({
        searchResults: 0,
        outcome: 'no_results'
      });
      return null;
    }

    console.log(`✅ Found ${searchResults.length} search results`);
    logAttributes({
      searchResultsCount: searchResults.length,
      topResultUrl: searchResults[0].url
    });

    // Try top 3 results
    for (let i = 0; i < Math.min(3, searchResults.length); i++) {
      const result = searchResults[i];
      console.log(`\n🌐 Checking result ${i + 1}: ${result.title}`);
      console.log(`   URL: ${result.url}`);

      try {
        // Navigate to the event page
        await page.goto(result.url, {
          waitUntil: 'networkidle',
          timeoutMs: 30000
        });

        // Wait for page to settle
        await page.waitForTimeout(2000);

        // Take screenshot
        const timestamp = Date.now();
        const screenshotFilename = `event_${timestamp}_result${i + 1}.png`;
        const screenshotPath = path.join(__dirname, '../../artifacts/screenshots', screenshotFilename);
        
        const screenshotBuffer = await page.screenshot({
          fullPage: true
        });
        
        // Write screenshot to file
        fs.writeFileSync(screenshotPath, screenshotBuffer);

        console.log(`📸 Screenshot saved: ${screenshotFilename}`);

        // Extract event details from page
        const pageEventSchema = z.object({
          name: z.string().optional(),
          date: z.string().optional(),
          time: z.string().optional(),
          location: z.string().optional(),
          venue: z.string().optional(),
          description: z.string().optional()
        });

        type PageEvent = {
          name?: string;
          date?: string;
          time?: string;
          location?: string;
          venue?: string;
          description?: string;
        };

        const pageEvent: PageEvent = await stagehand.extract(
          'extract event name, date, time, location, venue, and description from this page',
          pageEventSchema as any
        ) as any;

        console.log('📋 Extracted from page:', pageEvent);

        // Verify this matches the original flyer
        const verification = await verifyEventMatch(
          originalImageData,
          screenshotPath,
          extractedEvent,
          pageEvent
        );

        console.log(`✅ Verification: ${verification.verified ? 'MATCH' : 'NO MATCH'} (confidence: ${verification.confidence})`);
        console.log(`   Reasoning: ${verification.reasoning}`);

        logAttributes({
          resultIndex: i,
          resultUrl: result.url,
          verified: verification.verified,
          verificationConfidence: verification.confidence
        });

        if (verification.verified && verification.confidence >= 0.7) {
          // Found matching event!
          const recordingUrl = `https://www.browserbase.com/sessions/${sessionId}`;
          
          console.log(`🎉 Found matching event: ${result.title}`);
          console.log(`   Recording: ${recordingUrl}`);

          return {
            url: result.url,
            title: result.title,
            snippet: result.snippet,
            screenshotPath,
            verified: true,
            confidence: verification.confidence,
            sessionId,
            recordingUrl
          };
        }

      } catch (error: any) {
        console.log(`⚠️  Failed to check result ${i + 1}: ${error.message}`);
        continue;
      }
    }

    // No matching results found
    console.log('❌ No matching event pages found in top 3 results');
    logAttributes({
      outcome: 'no_match_found'
    });
    
    return null;

  } catch (error: any) {
    console.error('❌ Event search failed:', error.message);
    logAttributes({
      error: error.message,
      errorType: error.name || 'unknown'
    });
    throw error;

  } finally {
    // Close Stagehand session
    if (stagehand) {
      try {
        await stagehand.close();
        console.log('✅ Browserbase session closed');
      } catch (error: any) {
        console.error('⚠️  Failed to close Browserbase session:', error.message);
      }
    }
  }
};

/**
 * Verify that the found event page matches the original flyer
 * Uses Ollama vision model to compare images and extracted details
 */
async function verifyEventMatch(
  originalImageData: Buffer,
  browserScreenshotPath: string,
  flyerEvent: ExtractedEvent,
  pageEvent: any
): Promise<VerificationResult> {
  
  console.log('🔍 Verifying event match...');

  // Load screenshot
  const screenshotData = fs.readFileSync(browserScreenshotPath);
  const screenshotBase64 = screenshotData.toString('base64');
  const flyerBase64 = originalImageData.toString('base64');

  const prompt = `Compare these two images and determine if they represent the SAME event.

Image 1: Original event flyer
Image 2: Screenshot of event webpage

Extracted from flyer:
- Event Name: ${flyerEvent.eventName}
- Date: ${flyerEvent.date}
- Location: ${flyerEvent.location}
${flyerEvent.venue ? `- Venue: ${flyerEvent.venue}` : ''}

Extracted from webpage:
- Event Name: ${pageEvent.name || 'not found'}
- Date: ${pageEvent.date || 'not found'}  
- Location: ${pageEvent.location || 'not found'}
${pageEvent.venue ? `- Venue: ${pageEvent.venue}` : ''}

Do these represent the SAME event? Consider:
1. Event name matches (fuzzy match OK - "SF Tech Meetup" = "San Francisco Tech Meetup")
2. Date matches (format may differ - "March 15" = "Mar 15" = "3/15")
3. Location/venue matches (city or venue name)

Be somewhat lenient - minor variations in wording are OK if the core event is clearly the same.

Respond in this exact format:
MATCH: [yes|no]
CONFIDENCE: [0.0-1.0]
REASONING: [one sentence explaining why]`;

  try {
    const response = await axios.post(
      `${OLLAMA_BASE_URL}/api/generate`,
      {
        model: VISION_MODEL,
        prompt,
        images: [flyerBase64, screenshotBase64],
        stream: false
      },
      {
        timeout: 60000
      }
    );

    const result = response.data.response;
    const verification = parseVerificationResponse(result);
    
    logAttributes({
      verificationMatch: verification.verified,
      verificationConfidence: verification.confidence,
      verificationReasoning: verification.reasoning
    });

    return verification;

  } catch (error: any) {
    console.error('Verification failed:', error.message);
    return {
      verified: false,
      confidence: 0.0,
      reasoning: 'Verification check failed'
    };
  }
}

/**
 * Parse verification response from Ollama
 */
function parseVerificationResponse(response: string): VerificationResult {
  const lines = response.split('\n');
  let verified = false;
  let confidence = 0.5;
  let reasoning = '';

  for (const line of lines) {
    const trimmed = line.trim();
    
    if (trimmed.startsWith('MATCH:')) {
      const match = trimmed.substring('MATCH:'.length).trim().toLowerCase();
      verified = match === 'yes';
    } else if (trimmed.startsWith('CONFIDENCE:')) {
      const conf = parseFloat(trimmed.substring('CONFIDENCE:'.length).trim());
      if (!isNaN(conf) && conf >= 0 && conf <= 1) {
        confidence = conf;
      }
    } else if (trimmed.startsWith('REASONING:')) {
      reasoning = trimmed.substring('REASONING:'.length).trim();
    }
  }

  if (!reasoning) {
    reasoning = verified ? 'Event details match' : 'Event details do not match';
  }

  return { verified, confidence, reasoning };
}

/**
 * Search for event with Weave tracing
 */
export const searchForEvent = createTracedOp(
  'searchForEvent',
  _searchForEventImpl
);
