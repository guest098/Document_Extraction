import { EmbeddingModel } from "../models";
import type { Types } from "mongoose";
import { embedText } from "./gemini";
import { isChromaEnabled, search as chromaSearch } from "./chroma.js";

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0,
    normA = 0,
    normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export interface SearchResult {
  chunkId: string;
  sectionTitle?: string;
  pageNumber: number;
  text: string;
  score: number;
}

export async function vectorSearch(
  documentIds: Types.ObjectId[],
  query: string,
  topK: number = 5
): Promise<SearchResult[]> {
  const idStrings = documentIds.map((id) => id.toString());

  if (isChromaEnabled()) {
    const chromaResults = await chromaSearch(idStrings, query, topK);
    if (chromaResults.length > 0) {
      return chromaResults.map((r) => ({
        chunkId: r.chunkId,
        sectionTitle: r.sectionTitle,
        pageNumber: r.pageNumber,
        text: r.text,
        score: r.score,
      }));
    }
  }

  const queryEmbedding = await embedText(query);
  const embeddings = await EmbeddingModel.find({ documentId: { $in: documentIds } })
    .select("chunkId sectionTitle pageNumber text embeddingVector")
    .lean()
    .exec();

  if (queryEmbedding.length === 0) {
    const fallback = embeddings.slice(0, topK).map((doc) => ({
      chunkId: doc.chunkId,
      sectionTitle: doc.sectionTitle,
      pageNumber: doc.pageNumber,
      text: doc.text,
      score: 0.5,
    }));
    return fallback;
  }

  const withScores = embeddings.map((doc) => ({
    chunkId: doc.chunkId,
    sectionTitle: doc.sectionTitle,
    pageNumber: doc.pageNumber,
    text: doc.text,
    score: cosineSimilarity(queryEmbedding, doc.embeddingVector),
  }));

  withScores.sort((a, b) => b.score - a.score);
  return withScores.slice(0, topK).filter((r) => r.score > 0.1);
}
