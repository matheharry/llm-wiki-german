import { cosineSim } from "./embeddings.js";
import type { RankedItem } from "./types.js";

const TOP_N = 50;
const MIN_SIMILARITY = 0.1;
const RELATIVE_CUTOFF_RATIO = 0.25;

export function rankByEmbedding(
  index: ReadonlyMap<string, number[]>,
  queryVec: readonly number[],
  minSimilarity: number = MIN_SIMILARITY,
): RankedItem[] {
  const scored: RankedItem[] = [];
  for (const [id, vec] of index) {
    const score = cosineSim(queryVec, vec);
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

