import { describe, it, expect } from "vitest";
import { wordSimilarity } from "../../src/core/lint.js";
import { deduplicateEntityFacts } from "../../src/core/dedupe.js";
import type { LLMProvider } from "../../src/llm/provider.js";

describe("wordSimilarity", () => {
  it("should calculate similarity between strings correctly", () => {
    expect(wordSimilarity("Hat ein neues Model trainiert", "Trainierte ein neues Model")).toBeGreaterThanOrEqual(0.4);
    expect(wordSimilarity("Fakt eins", "Ein völlig anderer Satz ohne Übereinstimmung")).toBe(0);
  });
});

describe("deduplicateEntityFacts", () => {
  it("should merge redundant facts using mock provider", async () => {
    const mockProvider: LLMProvider = {
      async *complete() {
        yield `[\n  "Trainierte ein neues Model"\n]`;
      },
      async embed() {
        return [];
      },
      async ping() {
        return true;
      },
      async showModel() {
        return { contextLength: 2048 };
      },
    };

    const originalFacts = ["Hat ein neues Model trainiert", "Trainierte ein neues Model"];
    const result = await deduplicateEntityFacts(
      mockProvider,
      "dummy-model",
      "Gemma",
      "tool",
      originalFacts
    );

    expect(result).toEqual(["Trainierte ein neues Model"]);
  });

  it("should return original facts if parsing fails", async () => {
    const mockProvider: LLMProvider = {
      async *complete() {
        yield "Not JSON at all";
      },
      async embed() {
        return [];
      },
      async ping() {
        return true;
      },
      async showModel() {
        return { contextLength: 2048 };
      },
    };

    const originalFacts = ["Fact 1", "Fact 2"];
    const result = await deduplicateEntityFacts(
      mockProvider,
      "dummy-model",
      "Gemma",
      "tool",
      originalFacts
    );

    expect(result).toEqual(originalFacts);
  });
});
