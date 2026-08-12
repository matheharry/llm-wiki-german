import type { KnowledgeBase } from "../core/kb.js";
import type { LLMProvider } from "../llm/provider.js";
import type { EmbeddingsCache } from "../vault/plugin-data.js";
import {
  contextualTextForConcept,
  contextualTextForEntity,
  contextualTextForSource,
} from "./embedding-text.js";

/** Ollama model used to vectorize entities and questions. Hardcoded: the
 * embeddings cache is keyed only on source text, so swapping models would
 * silently mix incompatible vector spaces. */
/**
 * Whether the embedding model is based on intfloat/multilingual-e5, which
 * requires instruction prefixes ("passage: ", "query: ") for optimal results.
 */
export function needsE5Prefixes(model: string): boolean {
  return model.includes("e5") || model.includes("e5-large") || model.includes("e5-base");
}

/** Returns the correct prefix for indexing texts (entities/concepts). */
export function e5PassagePrefix(model: string): string {
  return needsE5Prefixes(model) ? "passage: " : "";
}

/**
 * Default embedding model.
 * embeddinggemma:latest is a Gemma-based multilingual embedding model available
 * via Ollama and works well for German-language content without E5 instruction prefixes.
 */
export const EMBEDDING_MODEL = "embeddinggemma:latest";

export function cosineSim(a: readonly number[], b: readonly number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export interface EmbeddingIndexProgress {
  /** 1-based count of items processed so far (cache hits included). */
  readonly current: number;
  /** Total number of items the build will visit. Stable for the whole call. */
  readonly total: number;
}

export interface BuildEmbeddingIndexArgs {
  kb: KnowledgeBase;
  provider: LLMProvider;
  model: string;
  cache: EmbeddingsCache;
  signal?: AbortSignal;
  onProgress?: (progress: EmbeddingIndexProgress) => void;
}

/** How many embed requests to run in parallel during index building. */
const EMBED_CONCURRENCY = 4;

/** Build a list of (id, text) pairs for every uncached entity, concept, and source. */
function buildPendingList(
  args: BuildEmbeddingIndexArgs,
  index: Map<string, number[]>,
  onProgress: () => void,
): Array<{ id: string; text: string }> {
  const prefix = e5PassagePrefix(args.model);
  const pending: Array<{ id: string; text: string }> = [];
  const entities = args.kb.allEntities();
  const concepts = args.kb.allConcepts();
  const sources = args.kb.allSources();

  for (const e of entities) {
    const id = e.id;
    const text = prefix + contextualTextForEntity(e);
    const cached = args.cache.entries[id];
    // Only reuse a vector when it was computed with the exact same model —
    // otherwise the vector spaces differ and mixing them silently corrupts
    // semantic search. Legacy entries without a `model` field are re-embedded
    // once (and backfilled with the model name).
    const cachedModel = cached?.model;
    if (cached && cached.sourceText === text && cachedModel === args.model) {
      index.set(id, cached.vector);
      onProgress();
    } else {
      pending.push({ id, text });
    }
  }

  for (const c of concepts) {
    const id = `concept:${c.id}`;
    const text = prefix + contextualTextForConcept(c);
    const cached = args.cache.entries[id];
    const cachedModel = cached?.model;
    if (cached && cached.sourceText === text && cachedModel === args.model) {
      index.set(id, cached.vector);
      onProgress();
    } else {
      pending.push({ id, text });
    }
  }

  for (const s of sources) {
    const id = `source:${s.id}`;
    const text = prefix + contextualTextForSource(s);
    const cached = args.cache.entries[id];
    const cachedModel = cached?.model;
    if (cached && cached.sourceText === text && cachedModel === args.model) {
      index.set(id, cached.vector);
      onProgress();
    } else {
      pending.push({ id, text });
    }
  }

  return pending;
}

/** Embed a single item; stores result in the index and cache. */
async function embedOne(
  args: BuildEmbeddingIndexArgs,
  index: Map<string, number[]>,
  item: { id: string; text: string },
): Promise<void> {
  const vec = await args.provider.embed({
    text: item.text,
    model: args.model,
    signal: args.signal,
  });
  args.cache.entries[item.id] = {
    sourceText: item.text,
    vector: vec,
    model: args.model,
  };
  index.set(item.id, vec);
}

export async function buildEmbeddingIndex(
  args: BuildEmbeddingIndexArgs,
): Promise<Map<string, number[]>> {
  const index = new Map<string, number[]>();
  const entities = args.kb.allEntities();
  const concepts = args.kb.allConcepts();
  const sources = args.kb.allSources();
  const total = entities.length + concepts.length + sources.length;
  let current = 0;

  const tick = (): void => {
    current += 1;
    args.onProgress?.({ current, total });
  };

  const pending = buildPendingList(args, index, tick);

  // Process pending items in parallel with bounded concurrency
  for (let i = 0; i < pending.length; i += EMBED_CONCURRENCY) {
    if (args.signal?.aborted) break;
    const batch = pending.slice(i, i + EMBED_CONCURRENCY);
    await Promise.all(
      batch.map(async (item) => {
        if (args.signal?.aborted) return;
        await embedOne(args, index, item);
        tick();
      }),
    );
  }

  return index;
}
