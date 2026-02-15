/**
 * Chroma vector DB for semantic search. Uses local embeddings (64-dim) so it works
 * without Gemini. Set CHROMA_URL (e.g. http://localhost:8000) to enable.
 */
import { ChromaClient } from "chromadb";
import { localEmbed } from "./localEmbedding.js";

const CHROMA_URL = process.env.CHROMA_URL || "";
const COLLECTION_NAME = "doc_chunks";

// Track if Chroma is available
let _chromaAvailable: boolean | null = null;

function getClient(): ChromaClient | null {
  if (!CHROMA_URL) {
    console.log("ChromaDB: No CHROMA_URL configured, using MongoDB embeddings");
    return null;
  }
  try {
    const url = new URL(CHROMA_URL);
    return new ChromaClient({
      host: url.hostname,
      port: url.port ? parseInt(url.port, 10) : url.protocol === "https:" ? 443 : 8000,
      ssl: url.protocol === "https:",
    });
  } catch {
    console.warn("ChromaDB: Invalid CHROMA_URL, using MongoDB embeddings");
    return null;
  }
}

let _client: ChromaClient | null | undefined = undefined;

function client(): ChromaClient | null {
  if (_client === undefined) _client = getClient();
  return _client;
}

export function isChromaEnabled(): boolean {
  if (!CHROMA_URL) return false;
  if (_chromaAvailable === null) {
    // Check if Chroma is actually reachable
    const c = client();
    if (!c) {
      _chromaAvailable = false;
      return false;
    }
    // We'll set this to true only after a successful operation
    return false; // Default to false, will be set to true after first successful operation
  }
  return _chromaAvailable;
}

function setChromaAvailable(available: boolean) {
  _chromaAvailable = available;
}

export async function getCollection() {
  const c = client();
  if (!c) return null;
  try {
    const coll = await c.getOrCreateCollection({ name: COLLECTION_NAME });
    return coll;
  } catch (err) {
    console.warn("Chroma getOrCreateCollection failed:", (err as Error).message);
    return null;
  }
}

export interface DocChunk {
  chunkId: string;
  documentId: string;
  pageNumber: number;
  sectionTitle?: string;
  text: string;
}

export async function addChunks(chunks: DocChunk[]): Promise<void> {
  const coll = await getCollection();
  if (!coll || chunks.length === 0) return;
  const ids = chunks.map((c) => c.chunkId);
  const texts = chunks.map((c) => c.text);
  const embeddings = texts.map((t) => localEmbed(t));
  const metadatas = chunks.map((c) => ({
    documentId: c.documentId,
    pageNumber: c.pageNumber,
    sectionTitle: c.sectionTitle ?? "",
  }));
  try {
    await coll.add({ ids, embeddings, documents: texts, metadatas });
  } catch (err) {
    console.warn("Chroma add failed:", (err as Error).message);
  }
}

export async function deleteByDocumentId(documentId: string): Promise<void> {
  const coll = await getCollection();
  if (!coll) return;
  try {
    await coll.delete({ where: { documentId } } as { where: Record<string, string> });
  } catch (err) {
    console.warn("Chroma delete failed:", (err as Error).message);
  }
}

export interface ChromaSearchResult {
  chunkId: string;
  pageNumber: number;
  sectionTitle?: string;
  text: string;
  score: number;
}

export async function search(
  documentIds: string[],
  query: string,
  topK: number = 5
): Promise<ChromaSearchResult[]> {
  const coll = await getCollection();
  if (!coll) return [];
  const queryEmbedding = localEmbed(query);
  try {
    const nResults = documentIds.length === 1 ? topK : Math.min(50, topK * documentIds.length);
    const result = await coll.query({
      queryEmbeddings: [queryEmbedding],
      nResults,
      ...(documentIds.length === 1 ? { where: { documentId: documentIds[0] } as Record<string, string> } : {}),
      include: ["documents", "metadatas", "distances"],
    });
    const docs = (result.documents?.[0] ?? []).filter((d): d is string => d !== null);
    const metas = result.metadatas?.[0] ?? [];
    const distances = result.distances?.[0] ?? [];
    const idList = result.ids?.[0] ?? [];
    const out = docs.map((text, i) => {
      const meta = (metas[i] ?? {}) as { documentId?: string; pageNumber?: number; sectionTitle?: string };
      const dist = (distances[i] ?? 0) as number;
      return {
        chunkId: (idList[i] as string) ?? `chroma_${i}`,
        documentId: meta.documentId,
        pageNumber: meta.pageNumber ?? 1,
        sectionTitle: meta.sectionTitle,
        text,
        score: 1 - dist,
      };
    });
    const filtered =
      documentIds.length > 1
        ? out.filter((r) => r.documentId && documentIds.includes(r.documentId)).slice(0, topK)
        : out;
    return filtered.map(({ documentId: _d, ...r }) => r);
  } catch (err) {
    console.warn("Chroma query failed:", (err as Error).message);
    return [];
  }
}
