import { describe, it, expect } from "vitest";
import { cosineSim, buildEmbeddingIndex, e5PassagePrefix } from "../../src/query/embeddings.js";
import { KnowledgeBase } from "../../src/core/kb.js";
import { MockLLMProvider } from "../helpers/mock-llm-provider.js";
import type { EmbeddingsCache } from "../../src/vault/plugin-data.js";

describe("cosineSim", () => {
  it("returns 1 for identical vectors", () => {
    expect(cosineSim([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 6);
  });
  it("returns 0 for orthogonal", () => {
    expect(cosineSim([1, 0], [0, 1])).toBeCloseTo(0, 6);
  });
  it("returns 0 for zero vector", () => {
    expect(cosineSim([0, 0], [1, 1])).toBe(0);
  });
});

describe("buildEmbeddingIndex", () => {
  it("embeds new entities and stores in cache", async () => {
    const kb = new KnowledgeBase();
    kb.addEntity({
      name: "Alan Watts",
      type: "person",
      aliases: [],
      facts: ["philosopher"],
      source: "x.md",
    });
    const provider = new MockLLMProvider({
      responses: [],
      embeddings: [[1, 0, 0]],
    });
    const cache: EmbeddingsCache = { entries: {} };
    const index = await buildEmbeddingIndex({
      kb,
      provider,
      model: "nomic-embed-text",
      cache,
    });
    expect(index.get("alan-watts")).toEqual([1, 0, 0]);
    expect(cache.entries["alan-watts"]?.vector).toEqual([1, 0, 0]);
    expect(cache.entries["alan-watts"]?.sourceText).toContain("Alan Watts");
  });

  it("skips re-embedding when cache sourceText matches", async () => {
    const kb = new KnowledgeBase();
    kb.addEntity({
      name: "Alan Watts",
      type: "person",
      aliases: [],
      facts: ["philosopher"],
      source: "x.md",
    });
    const provider = new MockLLMProvider({ responses: [], embeddings: [] });
    // pre-populate the cache with the EXACT current contextual text
    const { contextualTextForEntity } = await import(
      "../../src/query/embedding-text.js"
    );
    const text = contextualTextForEntity(kb.allEntities()[0]);
    const cache: EmbeddingsCache = {
      entries: {
        "alan-watts": { sourceText: text, vector: [9, 9, 9] },
      },
    };
    const index = await buildEmbeddingIndex({
      kb,
      provider,
      model: "nomic-embed-text",
      cache,
    });
    expect(index.get("alan-watts")).toEqual([9, 9, 9]);
  });

  it("re-embeds when cached sourceText is stale", async () => {
    const kb = new KnowledgeBase();
    kb.addEntity({
      name: "Alan Watts",
      type: "person",
      aliases: [],
      facts: ["new fact"],
      source: "x.md",
    });
    const provider = new MockLLMProvider({
      responses: [],
      embeddings: [[1, 1, 1]],
    });
    const cache: EmbeddingsCache = {
      entries: {
        "alan-watts": { sourceText: "stale text", vector: [9, 9, 9] },
      },
    };
    const index = await buildEmbeddingIndex({
      kb,
      provider,
      model: "nomic-embed-text",
      cache,
    });
    expect(index.get("alan-watts")).toEqual([1, 1, 1]);
  });

  it("calls onProgress for every entity and concept with a stable total", async () => {
    const kb = new KnowledgeBase();
    kb.addEntity({
      name: "Alan Watts",
      type: "person",
      aliases: [],
      facts: ["philosopher"],
      source: "x.md",
    });
    kb.addEntity({
      name: "Richard Feynman",
      type: "person",
      aliases: [],
      facts: ["physicist"],
      source: "x.md",
    });
    kb.addConcept({
      name: "Flow",
      definition: "absorbed attention",
      source: "x.md",
    });
    const provider = new MockLLMProvider({
      responses: [],
      embeddings: [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
    });
    const cache: EmbeddingsCache = { entries: {} };
    const events: Array<{ current: number; total: number }> = [];
    await buildEmbeddingIndex({
      kb,
      provider,
      model: "nomic-embed-text",
      cache,
      onProgress: (p) => events.push({ ...p }),
    });
    expect(events.length).toBe(3);
    expect(events[0]).toEqual({ current: 1, total: 3 });
    expect(events[1]).toEqual({ current: 2, total: 3 });
    expect(events[2]).toEqual({ current: 3, total: 3 });
  });

  it("calls onProgress even for cache hits", async () => {
    const kb = new KnowledgeBase();
    kb.addEntity({
      name: "Alan Watts",
      type: "person",
      aliases: [],
      facts: ["philosopher"],
      source: "x.md",
    });
    const { contextualTextForEntity } = await import(
      "../../src/query/embedding-text.js"
    );
    const text = contextualTextForEntity(kb.allEntities()[0]);
    const cache: EmbeddingsCache = {
      entries: {
        "alan-watts": { sourceText: text, vector: [9, 9, 9] },
      },
    };
    const provider = new MockLLMProvider({ responses: [], embeddings: [] });
    const events: Array<{ current: number; total: number }> = [];
    await buildEmbeddingIndex({
      kb,
      provider,
      model: "nomic-embed-text",
      cache,
      onProgress: (p) => events.push({ ...p }),
    });
    expect(events).toEqual([{ current: 1, total: 1 }]);
  });

  it("stores the model in cache entries upon embedding", async () => {
    const kb = new KnowledgeBase();
    kb.addEntity({
      name: "Alan Watts",
      type: "person",
      aliases: [],
      facts: ["philosopher"],
      source: "x.md",
    });
    const provider = new MockLLMProvider({
      responses: [],
      embeddings: [[1, 2, 3]],
    });
    const cache: EmbeddingsCache = { entries: {} };
    await buildEmbeddingIndex({
      kb,
      provider,
      model: "qllama/multilingual-e5-base:latest",
      cache,
    });
    expect(cache.entries["alan-watts"]?.model).toBe("qllama/multilingual-e5-base:latest");
  });

  it("skips re-embedding when both sourceText and model match", async () => {
    const kb = new KnowledgeBase();
    kb.addEntity({
      name: "Alan Watts",
      type: "person",
      aliases: [],
      facts: ["philosopher"],
      source: "x.md",
    });
    const provider = new MockLLMProvider({ responses: [], embeddings: [] });
    const { contextualTextForEntity } = await import(
      "../../src/query/embedding-text.js"
    );
    // The e5 prefix is prepended to the source text before embedding,
    // so the cache entry must include it for a match.
    const rawText = contextualTextForEntity(kb.allEntities()[0]);
    const prefix = e5PassagePrefix("qllama/multilingual-e5-base:latest");
    const cache: EmbeddingsCache = {
      entries: {
        "alan-watts": { sourceText: prefix + rawText, vector: [9, 9, 9], model: "qllama/multilingual-e5-base:latest" },
      },
    };
    const index = await buildEmbeddingIndex({
      kb,
      provider,
      model: "qllama/multilingual-e5-base:latest",
      cache,
    });
    expect(index.get("alan-watts")).toEqual([9, 9, 9]);
  });

  it("re-embeds when cached model is different", async () => {
    const kb = new KnowledgeBase();
    kb.addEntity({
      name: "Alan Watts",
      type: "person",
      aliases: [],
      facts: ["philosopher"],
      source: "x.md",
    });
    const provider = new MockLLMProvider({
      responses: [],
      embeddings: [[5, 5, 5]],
    });
    const { contextualTextForEntity } = await import(
      "../../src/query/embedding-text.js"
    );
    const text = contextualTextForEntity(kb.allEntities()[0]);
    const cache: EmbeddingsCache = {
      entries: {
        "alan-watts": { sourceText: text, vector: [9, 9, 9], model: "nomic-embed-text" },
      },
    };
    const index = await buildEmbeddingIndex({
      kb,
      provider,
      model: "qllama/multilingual-e5-base:latest",
      cache,
    });
    expect(index.get("alan-watts")).toEqual([5, 5, 5]);
    expect(cache.entries["alan-watts"]?.model).toBe("qllama/multilingual-e5-base:latest");
  });
});
