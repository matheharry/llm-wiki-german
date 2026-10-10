import { sumOfSquares } from "./embeddings.js";
import type { RankedItem } from "./types.js";

const TOP_N = 50;
const MIN_SIMILARITY = 0.1;
const RELATIVE_CUTOFF_RATIO = 0.25;

export function rankByEmbedding(
  index: ReadonlyMap<string, number[]>,
  queryVec: readonly number[],
  minSimilarity: number = MIN_SIMILARITY,
  norms?: ReadonlyMap<string, number>,
): RankedItem[] {
  // The query vector's norm is the same for every comparison — compute it
  // once instead of inside a per-vector cosine helper. When `norms` carries
  // the indexed vectors' precomputed norms (see `buildNormIndex`), the inner
  // loop is a bare dot product.
  const queryNorm = Math.sqrt(sumOfSquares(queryVec));

  const scored: RankedItem[] = [];
  for (const [id, vec] of index) {
    const len = Math.min(queryVec.length, vec.length);
    let dot = 0;
    for (let i = 0; i < len; i++) dot += queryVec[i] * vec[i];

    let vecNorm = norms?.get(id);
    if (vecNorm === undefined) {
      let sq = 0;
      for (let i = 0; i < len; i++) sq += vec[i] * vec[i];
      vecNorm = Math.sqrt(sq);
    }

    let score = 0;
    if (queryNorm > 0 && vecNorm > 0) score = dot / (queryNorm * vecNorm);
    if (score >= minSimilarity) scored.push({ id, score });
  }
  scored.sort((a, b) => b.score - a.score);

  // Dynamic cutoff: if top match is strong, prune distant noise
  if (scored.length > 0 && scored[0].score >= 0.4) {
    const minThreshold = Math.max(minSimilarity, scored[0].score * RELATIVE_CUTOFF_RATIO);
    const cutIdx = scored.findIndex((item) => item.score < minThreshold);
    if (cutIdx !== -1) {
      return scored.slice(0, Math.min(cutIdx, TOP_N));
    }
  }

  return scored.slice(0, TOP_N);
}
