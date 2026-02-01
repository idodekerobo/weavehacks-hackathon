import axios from 'axios';

const OLLAMA_BASE_URL = 'http://localhost:11434';
const VISION_MODEL = 'qwen3-vl:8b';
const EMBEDDING_MODEL = 'nomic-embed-text';

export interface AnalysisResult {
  summary: string;
  ocrText: string;
  embedding: number[];
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

export async function analyzeImage(imageData: Buffer): Promise<AnalysisResult> {
  const base64Image = imageData.toString('base64');

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

  return { summary, ocrText, embedding };
}

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
