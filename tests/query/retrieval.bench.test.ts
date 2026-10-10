import { describe, expect, it } from "vitest";
import { performance } from "node:perf_hooks";

import { KnowledgeBase } from "../../src/core/kb.js";
import { retrieve } from "../../src/query/retrieve.js";

/**
 * Regression guard for the retrieval hot path.
 *
 * `retrieve()` used to rescore every fused item through a helper that scanned
 * the whole KB three times per item — O(n²) on every query. The fix made that
 * O(1) per item. This benchmark builds a KB large enough that the quadratic
 * behaviour would blow far past the ceiling below, so a reintroduced
 * per-item scan fails the suite instead of silently slowing search on
 * low-memory machines.
 */

const N_ENTITIES = 8_000;
const N_CONCEPTS = 4_000;
const N_SOURCES = 4_000;
const EMBED_DIM = 32;

function buildLargeKb(): KnowledgeBase {
  const kb = new KnowledgeBase();
  for (let i = 0; i < N_SOURCES; i++) {
    kb.markSource({
      path: `notes/Note ${i}.md`,
      summary: `A summary about topic ${i % 500} and subject ${i % 137}`,
      mtime: i,
      origin: "user-note",
    });
  }
  for (let i = 0; i < N_ENTITIES; i++) {
    const source = `notes/Note ${i % N_SOURCES}.md`;
    kb.addEntity({
      name: `Entity ${i}`,
      type: i % 2 === 0 ? "person" : "org",
      aliases: [`E${i}`],
      facts: [
        `Fact about topic ${i % 500}`,
        `Works with subject ${i % 137}`,
        `Reference number ${i}`,
      ],
      source,
    });
  }
  for (let i = 0; i < N_CONCEPTS; i++) {
    kb.addConcept({
      name: `Concept ${i}`,
      definition: `Definition of concept ${i} covering topic ${i % 500}`,
      related: [`Concept ${(i + 1) % N_CONCEPTS}`],
      source: `notes/Note ${i % N_SOURCES}.md`,
    });
  }
  return kb;
}

function buildEmbeddingIndex(count: number): Map<string, number[]> {
  const index = new Map<string, number[]>();
  for (let i = 0; i < count; i++) {
    const vec = new Array<number>(EMBED_DIM);
    for (let d = 0; d < EMBED_DIM; d++) vec[d] = Math.sin(i + d);
    index.set(i % N_CONCEPTS === 0 ? `concept:concept-${i}` : `entity-${i}`, vec);
  }
  return index;
}

function timeRetrieve(
  kb: KnowledgeBase,
  index: Map<string, number[]>,
  query: string,
  repeats: number,
): number {
  const queryEmbedding = new Array<number>(EMBED_DIM).fill(0.05);
  let best = Number.POSITIVE_INFINITY;
  for (let r = 0; r < repeats; r++) {
    const start = performance.now();
    retrieve({ question: query, kb, embeddingIndex: index, queryEmbedding });
    best = Math.min(best, performance.now() - start);
  }
  return best;
}

describe("retrieval benchmark", () => {
  it("retrieves from a large KB well under the regression ceiling", () => {
    const kb = buildLargeKb();
    const index = buildEmbeddingIndex(N_ENTITIES);

    const queries = [
      "who is Entity 42",
      "list categories about topic 17",
      "how does concept 500 relate to topic 12",
    ];

    // Warm caches, then take the best of a few runs to damp scheduler noise.
    for (const q of queries) timeRetrieve(kb, index, q, 1);

    let worst = 0;
    for (const q of queries) {
      const ms = timeRetrieve(kb, index, q, 5);
      worst = Math.max(worst, ms);
      process.stdout.write(`retrieve(${JSON.stringify(q)}) best ${ms.toFixed(1)}ms\n`);
    }

    expect(worst).toBeLessThan(1500);
  });
});
