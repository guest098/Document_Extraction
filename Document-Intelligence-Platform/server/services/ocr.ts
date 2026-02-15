/**
 * Tesseract OCR for image text extraction.
 * Runs locally, supports 100+ languages, no external API required.
 */
import { createWorker } from "tesseract.js";

export interface OcrResult {
  text: string;
}

const DEFAULT_LANG = "eng";

/**
 * Extract text from an image buffer using Tesseract OCR.
 * Use when Gemini vision is unavailable or for reliable local extraction.
 * Accepts Buffer (Node) or file path.
 */
export async function extractTextFromImage(
  imageBuffer: Buffer | string,
  _mimeType?: string
): Promise<OcrResult> {
  const worker = await createWorker(DEFAULT_LANG, 1, {
    logger: () => {}, // suppress progress logs
  });
  try {
    const { data } = await worker.recognize(imageBuffer as string);
    const text = (data?.text || "").trim();
    return { text };
  } finally {
    await worker.terminate();
  }
}
