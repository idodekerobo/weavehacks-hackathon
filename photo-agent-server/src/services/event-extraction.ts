import axios from 'axios';
import { createTracedOp, logAttributes } from './weave';

const OLLAMA_BASE_URL = 'http://localhost:11434';
const VISION_MODEL = 'qwen3-vl:8b';

/**
 * Extracted event details from a flyer image
 */
export interface ExtractedEvent {
  eventName: string;      // required
  date: string;           // required (may be ambiguous like "Next Friday")
  time?: string;          // optional (might be TBD)
  location: string;       // required (city/area)
  venue?: string;         // optional (specific venue name)
  url?: string;           // optional (if visible on flyer)
  description?: string;   // optional
  ticketPrice?: string;   // optional (free, $20, etc.)
  confidence: number;     // 0.0-1.0 confidence in extraction
}

/**
 * Event extraction result
 */
export interface EventExtractionResult {
  success: boolean;
  event?: ExtractedEvent;
  error?: string;
  reasoning?: string;
}

/**
 * Extract event details from a flyer image using Ollama structured output
 */
const _extractEventDetailsImpl = async (
  imageData: Buffer
): Promise<EventExtractionResult> => {
  const base64Image = imageData.toString('base64');

  logAttributes({
    model: VISION_MODEL,
    operation: 'event_extraction',
    imageSize: imageData.length
  });

  const prompt = `You are an expert at extracting event information from flyers and posters.

Analyze this image and extract event details. This could be:
- A physical flyer/poster photographed
- A screenshot of an event page
- A digital event announcement
- An invitation

Extract the following information:

**Event Name** (required): The name/title of the event
**Date** (required): When the event happens (return EXACTLY as written, even if ambiguous like "Next Friday" or "TBD")
**Time** (optional): What time the event starts (return as written, or omit if not specified)
**Location** (required): City or general area where event takes place
**Venue** (optional): Specific venue name (e.g., "The Fillmore", "Golden Gate Park")
**URL** (optional): Any website URL visible on the flyer
**Description** (optional): Brief description of what the event is about (1-2 sentences max)
**Ticket Price** (optional): Cost information (e.g., "Free", "$20", "$10-15")

Important:
- Return dates/times EXACTLY as they appear (don't try to resolve ambiguity)
- If information is missing or unclear, omit that field
- Be conservative with confidence - only high confidence if information is clearly visible
- If this doesn't look like an event flyer at all, return low confidence

Return your response as a JSON object with this exact structure:
{
  "isEventFlyer": boolean,
  "eventName": "string",
  "date": "string",
  "time": "string or omit",
  "location": "string",
  "venue": "string or omit",
  "url": "string or omit",
  "description": "string or omit",
  "ticketPrice": "string or omit",
  "confidence": number between 0 and 1,
  "reasoning": "one sentence explaining your extraction"
}`;

  try {
    const response = await axios.post(
      `${OLLAMA_BASE_URL}/api/generate`,
      {
        model: VISION_MODEL,
        prompt,
        images: [base64Image],
        stream: false,
        format: 'json' // Request JSON format from Ollama
      },
      {
        timeout: 60000 // 60 second timeout for vision model
      }
    );

    const rawResponse = response.data.response;
    
    // Parse JSON response
    let parsed: any;
    try {
      parsed = JSON.parse(rawResponse);
    } catch (parseError) {
      console.error('Failed to parse Ollama JSON response:', rawResponse);
      return {
        success: false,
        error: 'Failed to parse structured output from model'
      };
    }

    // Validate response
    if (!parsed.isEventFlyer) {
      logAttributes({
        isEventFlyer: false,
        confidence: parsed.confidence || 0
      });
      return {
        success: false,
        error: 'Image does not appear to be an event flyer',
        reasoning: parsed.reasoning
      };
    }

    // Check required fields
    if (!parsed.eventName || !parsed.date || !parsed.location) {
      return {
        success: false,
        error: 'Missing required event fields (name, date, or location)',
        reasoning: parsed.reasoning
      };
    }

    // Build extracted event object
    const event: ExtractedEvent = {
      eventName: parsed.eventName,
      date: parsed.date,
      location: parsed.location,
      confidence: parsed.confidence || 0.5
    };

    // Add optional fields if present
    if (parsed.time) event.time = parsed.time;
    if (parsed.venue) event.venue = parsed.venue;
    if (parsed.url) event.url = parsed.url;
    if (parsed.description) event.description = parsed.description;
    if (parsed.ticketPrice) event.ticketPrice = parsed.ticketPrice;

    logAttributes({
      isEventFlyer: true,
      eventName: event.eventName,
      hasTime: !!event.time,
      hasVenue: !!event.venue,
      hasUrl: !!event.url,
      confidence: event.confidence
    });

    return {
      success: true,
      event,
      reasoning: parsed.reasoning
    };

  } catch (error: any) {
    console.error('Event extraction failed:', error.message);
    logAttributes({
      error: error.message,
      errorType: error.code || 'unknown'
    });

    return {
      success: false,
      error: `Extraction failed: ${error.message}`
    };
  }
};

/**
 * Extract event details with Weave tracing
 */
export const extractEventDetails = createTracedOp(
  'extractEventDetails',
  _extractEventDetailsImpl
);

/**
 * Check if an image is likely an event flyer (helper for quick classification)
 */
export async function isLikelyEventFlyer(
  summary: string,
  ocrText: string
): Promise<boolean> {
  // Quick heuristic based on keywords before doing full extraction
  const eventKeywords = [
    'event', 'rsvp', 'ticket', 'venue', 'concert', 'show', 'festival',
    'meetup', 'workshop', 'conference', 'party', 'celebration', 'gathering',
    'date:', 'time:', 'location:', 'when:', 'where:', 'join us'
  ];

  const combinedText = (summary + ' ' + ocrText).toLowerCase();
  const matchCount = eventKeywords.filter(keyword => 
    combinedText.includes(keyword)
  ).length;

  // If 2+ keywords match, likely an event flyer
  return matchCount >= 2;
}
