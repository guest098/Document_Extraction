/**
 * Local fallback embedding: produces a fixed-size vector from text for keyword-style search
 * when Gemini embedding API is unavailable. Not semantic but allows vector DB to work.
 */
const EMBED_DIM = 64;

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

export function localEmbed(text: string): number[] {
  const vec = new Array(EMBED_DIM).fill(0);
  const tokens = text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
  for (const t of tokens) {
    const idx = Math.abs(hashStr(t)) % EMBED_DIM;
    vec[idx] += 1;
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}
