import axios from 'axios';
import { createTracedOp, logAttributes } from './weave';

const OLLAMA_BASE_URL = 'http://localhost:11434';
const VISION_MODEL = 'qwen3-vl:8b';
const EMBEDDING_MODEL = 'nomic-embed-text';

export interface AnalysisResult {
  summary: string;
  ocrText: string;
  embedding: number[];
}

export interface IntentClassification {
  intentType: 'event_flyer' | 'general_photo' | 'other';
  confidence: number;
  reasoning: string;
}

export async function checkOllamaStatus(): Promise<boolean> {
  try {
    const response = await axios.get(`${OLLAMA_BASE_URL}/api/tags`);
    const models = response.data.models.map((m: any) => m.name);
    return models.includes(VISION_MODEL) && models.includes(EMBEDDING_MODEL);
  } catch (error) {
    return false;
  }
}

// Wrap with Weave tracing
const _analyzeImageImpl = async (imageData: Buffer): Promise<AnalysisResult> => {
  const base64Image = imageData.toString('base64');

  // Log trace attributes
  logAttributes({
    model: VISION_MODEL,
    operation: 'image_analysis',
    imageSize: imageData.length
  });

  // Step 1: Generate summary and OCR
  const prompt = `Your task is to create an opinionated summary of this image and an explanation of your reasoning for generating the summary. The summary is going to be later used for retrieval via search, categorization and other downstream tasks. The summary shouldn't be longer than 4 sentences.

Things to focus on:
- include what the image/scene is
- colors
- defining qualities of the image
- if it is pictures of people, describe the relationship between the people
- describe the foreground and background of the image
- if the image is mostly text (e.g. book/essay/article screenshot, social media post that is mostly text, informational flyer/poster) make sure the summary describes the text content or theme

After the summary, extract ALL visible text from the image (OCR). Format your response as:
SUMMARY: [your summary here]
OCR: [all extracted text here]`;

  const generateResponse = await axios.post(`${OLLAMA_BASE_URL}/api/generate`, {
    model: VISION_MODEL,
    prompt,
    images: [base64Image],
    stream: false
  });

  const fullResponse = generateResponse.data.response;
  const { summary, ocrText } = parseResponseForSummaryAndOCR(fullResponse);

  // Step 2: Generate embedding from summary
  const embeddingResponse = await axios.post(`${OLLAMA_BASE_URL}/api/embeddings`, {
    model: EMBEDDING_MODEL,
    prompt: summary
  });

  const embedding = embeddingResponse.data.embedding;

  // Log results
  logAttributes({
    summaryLength: summary.length,
    ocrLength: ocrText.length,
    embeddingDim: embedding.length
  });

  return { summary, ocrText, embedding };
};

export const analyzeImage = createTracedOp('analyzeImage', _analyzeImageImpl);

function parseResponseForSummaryAndOCR(response: string): { summary: string; ocrText: string } {
  const lines = response.split('\n');
  let summary = '';
  let ocrText = '';
  let currentSection = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('SUMMARY:')) {
      currentSection = 'summary';
      summary = trimmed.substring('SUMMARY:'.length).trim();
    } else if (trimmed.startsWith('OCR:')) {
      currentSection = 'ocr';
      ocrText = trimmed.substring('OCR:'.length).trim();
    } else if (currentSection === 'summary') {
      summary += ' ' + trimmed;
    } else if (currentSection === 'ocr') {
      ocrText += ' ' + trimmed;
    }
  }

  // Fallback if parsing failed
  if (!summary) {
    const midpoint = Math.floor(response.length / 2);
    summary = response.substring(0, midpoint).trim();
    ocrText = response.substring(midpoint).trim();
  }

  return { summary, ocrText };
}

/**
 * Classify the intent type of an image based on its analysis
 * Returns: event_flyer, general_photo, or other
 */
const _classifyIntentImpl = async (
  summary: string,
  ocrText: string
): Promise<IntentClassification> => {
  logAttributes({
    model: VISION_MODEL,
    operation: 'intent_classification'
  });

  const prompt = `Analyze the following image description and extracted text to determine what type of intent this image represents.

Image Summary: ${summary}

Extracted Text (OCR): ${ocrText}

Based on this information, classify the image into ONE of these categories:

1. **event_flyer** - This is an event flyer, poster, or invitation. Look for:
   - Event names or titles
   - Dates and times
   - Venue or location information
   - RSVP links or QR codes
   - Event organizers or hosts
   - Ticket information
   - Examples: concert flyers, meetup announcements, party invitations, conference posters

2. **general_photo** - This is a regular photograph capturing a moment, scene, or subject:
   - Personal photos of people, places, nature
   - Screenshots of non-event content
   - Product photos
   - Scenic views
   - Portraits or group photos

3. **other** - Anything that doesn't clearly fit the above categories:
   - Receipts
   - Documents
   - Screenshots of articles or social media
   - Memes or graphics
   - Abstract images

Respond ONLY in this exact format:
INTENT: [event_flyer|general_photo|other]
CONFIDENCE: [0.0-1.0]
REASONING: [one sentence explaining why]

Example responses:
INTENT: event_flyer
CONFIDENCE: 0.95
REASONING: Contains date, time, venue information and QR code for an event.

INTENT: general_photo
CONFIDENCE: 0.85
REASONING: Shows people at a gathering with no promotional event information visible.`;

  try {
    const response = await axios.post(`${OLLAMA_BASE_URL}/api/generate`, {
      model: VISION_MODEL,
      prompt,
      stream: false
    });

    const result = response.data.response;
    const classification = parseIntentClassification(result);
    
    logAttributes({
      intentType: classification.intentType,
      confidence: classification.confidence
    });

    return classification;
  } catch (error) {
    console.error('Failed to classify intent:', error);
    // Default fallback
    return {
      intentType: 'other',
      confidence: 0.5,
      reasoning: 'Classification failed, defaulting to other'
    };
  }
};

export const classifyIntent = createTracedOp('classifyIntent', _classifyIntentImpl);

/**
 * Parse the intent classification response from the LLM
 */
function parseIntentClassification(response: string): IntentClassification {
  const lines = response.split('\n');
  let intentType: IntentClassification['intentType'] = 'other';
  let confidence = 0.5;
  let reasoning = '';

  for (const line of lines) {
    const trimmed = line.trim();
    
    if (trimmed.startsWith('INTENT:')) {
      const intent = trimmed.substring('INTENT:'.length).trim().toLowerCase();
      if (intent === 'event_flyer' || intent === 'general_photo' || intent === 'other') {
        intentType = intent as IntentClassification['intentType'];
      }
    } else if (trimmed.startsWith('CONFIDENCE:')) {
      const conf = parseFloat(trimmed.substring('CONFIDENCE:'.length).trim());
      if (!isNaN(conf) && conf >= 0 && conf <= 1) {
        confidence = conf;
      }
    } else if (trimmed.startsWith('REASONING:')) {
      reasoning = trimmed.substring('REASONING:'.length).trim();
    }
  }

  // Fallback reasoning if not found
  if (!reasoning) {
    reasoning = 'Intent classification completed';
  }

  return { intentType, confidence, reasoning };
}
