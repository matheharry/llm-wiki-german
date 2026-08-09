import { describe, it, expect } from "vitest";
import { KnowledgeBase } from "../../src/core/kb.js";
import { extractFile, previewRawResponse } from "../../src/extract/extractor.js";
import { MockLLMProvider } from "../helpers/mock-llm-provider.js";

const HAPPY_JSON = `{
  "source_summary": "About Alan Watts.",
  "entities": [
    {"name": "Alan Watts", "type": "person", "aliases": ["A.W."], "facts": ["wrote The Wisdom of Insecurity"]}
  ],
  "concepts": [
    {"name": "Zen", "definition": "School of Mahayana.", "related": ["Alan Watts"]}
  ],
  "connections": [
    {"from": "Alan Watts", "to": "Zen", "type": "influences", "description": "popularized zen"}
  ]
}`;

describe("extractFile", () => {
  it("calls the provider and merges the parsed result into the KB", async () => {
    const kb = new KnowledgeBase();
    const provider = new MockLLMProvider([HAPPY_JSON]);

    const result = await extractFile({
      provider,
      kb,
      file: {
        path: "Books/watts.md",
        content: "Alan Watts wrote about Zen.",
        mtime: 1000,
        contentHash: "watts-hash",
        origin: "user-note",
      },
      model: "gemma4:e4b-it-qat",
      outputLanguage: "French",
    });

    expect(result).not.toBeNull();
    expect(kb.stats().entities).toBe(1);
    expect(kb.data.entities["alan-watts"]?.name).toBe("Alan Watts");
    expect(kb.data.entities["alan-watts"]?.aliases).toContain("A.W.");
    expect(kb.data.concepts["zen"]?.definition).toBe("School of Mahayana.");
    expect(kb.data.connections).toHaveLength(1);
    expect(kb.data.sources["Books/watts.md"]?.mtime).toBe(1000);
    expect(kb.data.sources["Books/watts.md"]?.contentHash).toBe("watts-hash");
    expect(kb.data.sources["Books/watts.md"]?.origin).toBe("user-note");

    expect(provider.calls).toHaveLength(1);
    const call = provider.calls[0];
    expect(call.model).toBe("gemma4:e4b-it-qat");
    expect(call.prompt).toContain("DOKUMENT (Books/watts.md):");
    expect(call.prompt).toContain("Alan Watts wrote about Zen.");
    expect(call.prompt).toContain(
      "Die gesamte Ausgabe muss in French erfolgen, unabhängig von der Sprache des Quelltexts.",
    );
  });

  it("returns null when the provider yields no JSON", async () => {
    const kb = new KnowledgeBase();
    const provider = new MockLLMProvider(["I'm sorry, I can't do that."]);
    const result = await extractFile({
      provider,
      kb,
      file: {
        path: "x.md",
        content: "body",
        mtime: 1,
        contentHash: "h1",
        origin: "user-note",
      },
      model: "gemma4:e4b-it-qat",
    });
    expect(result).toBeNull();
    expect(kb.stats().entities).toBe(0);
    expect(kb.isProcessed("x.md")).toBe(false);
  });

  it("truncates content longer than DEFAULT_CHAR_LIMIT when chunking disabled", async () => {
    const kb = new KnowledgeBase();
    const provider = new MockLLMProvider([HAPPY_JSON]);
    const huge = "x".repeat(20_000);
    await extractFile({
      provider,
      kb,
      file: {
        path: "big.md",
        content: huge,
        mtime: 1,
        contentHash: "big-hash",
        origin: "user-note",
      },
      model: "gemma4:e4b-it-qat",
      chunkingEnabled: false,
    });
    const prompt = provider.calls[0].prompt;
    expect(prompt).toContain("[... truncated ...]");
    expect(prompt.length).toBeLessThan(20_000);
  });

  it("calls onParseError with the raw response when parsing fails", async () => {
    const kb = new KnowledgeBase();
    const raw = "I'm sorry, I can't do that.";
    const provider = new MockLLMProvider([raw]);
    let captured: string | null = null;
    const result = await extractFile({
      provider,
      kb,
      file: {
        path: "x.md",
        content: "body",
        mtime: 1,
        contentHash: "h1",
        origin: "user-note",
      },
      model: "gemma4:e4b-it-qat",
      onParseError: (r) => {
        captured = r;
      },
    });
    expect(result).toBeNull();
    expect(captured).toBe(raw);
  });

  it("previewRawResponse truncates long responses", () => {
    const long = "a".repeat(500);
    const preview = previewRawResponse(long);
    expect(preview.length).toBeLessThan(500);
    expect(preview.endsWith("…")).toBe(true);
  });

  it("previewRawResponse collapses whitespace", () => {
    const preview = previewRawResponse("line1\n\n  line2\t\tline3");
    expect(preview).toBe("line1 line2 line3");
  });

  it("propagates AbortError from the provider", async () => {
    const kb = new KnowledgeBase();
    const provider = new MockLLMProvider([HAPPY_JSON]);
    const controller = new AbortController();
    controller.abort();
    await expect(
      extractFile({
        provider,
        kb,
        file: {
          path: "y.md",
          content: "body",
          mtime: 1,
          contentHash: "y-hash",
          origin: "user-note",
        },
        model: "gemma4:e4b-it-qat",
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "LLMAbortError" });
  });

  it("chunks long content and merges results from multiple LLM calls", async () => {
    const kb = new KnowledgeBase();
    const chunk1 = `{
      "source_summary": "Erster Teil.",
      "entities": [{"name": "Alan Watts", "type": "person", "facts": ["wrote books"]}],
      "concepts": [], "connections": []
    }`;
    const chunk2 = `{
      "source_summary": "Zweiter Teil.",
      "entities": [{"name": "Alan Watts", "type": "person", "facts": ["gave lectures"]}],
      "concepts": [{"name": "Zen", "definition": "School of Mahayana."}], "connections": []
    }`;
    const provider = new MockLLMProvider([chunk1, chunk2]);

    // Long content split into 2 chunks at 1000 chars, overlap 0.
    const base = "Abc def ghi. ".repeat(60); // ~780 chars
    const content = base + "\n\n" + base;

    const result = await extractFile({
      provider,
      kb,
      file: {
        path: "long.md",
        content,
        mtime: 5,
        contentHash: "long-hash",
        origin: "user-note",
      },
      model: "gemma4:e4b-it-qat",
      charLimit: 1000,
      chunkingEnabled: true,
      maxChunks: 20,
      chunkOverlapChars: 0,
    });

    expect(result).not.toBeNull();
    // Two LLM calls were made.
    expect(provider.calls).toHaveLength(2);
    // The duplicate entity was merged into one entry with both facts.
    const alan = kb.getEntity("Alan Watts");
    expect(alan).toBeDefined();
    expect(alan!.facts).toContain("wrote books");
    expect(alan!.facts).toContain("gave lectures");
    // Concepts from the second chunk are present.
    expect(kb.getConcept("Zen")).toBeDefined();
    // Source marked exactly once.
    expect(kb.data.sources["long.md"]).toBeDefined();
    expect(kb.isProcessed("long.md")).toBe(true);
  });

  it("keeps successful chunks when one chunk fails to parse", async () => {
    const kb = new KnowledgeBase();
    const good = `{
      "source_summary": "Guter Teil.",
      "entities": [{"name": "Alan Watts", "type": "person", "facts": ["wrote"]}],
      "concepts": [], "connections": []
    }`;
    const bad = "I'm sorry, I can't do that.";
    const provider = new MockLLMProvider([good, bad]);

    const base = "Abc def ghi. ".repeat(60);
    const content = base + "\n\n" + base;

    const result = await extractFile({
      provider,
      kb,
      file: {
        path: "partial.md",
        content,
        mtime: 6,
        contentHash: "partial-hash",
        origin: "user-note",
      },
      model: "gemma4:e4b-it-qat",
      charLimit: 1000,
      chunkingEnabled: true,
      maxChunks: 20,
      chunkOverlapChars: 0,
    });

    // Result is non-null because at least one chunk succeeded.
    expect(result).not.toBeNull();
    expect(kb.getEntity("Alan Watts")).toBeDefined();
    expect(kb.isProcessed("partial.md")).toBe(true);
  });

  it("uses single LLM call when chunking disabled and content exceeds limit (legacy truncate)", async () => {
    const kb = new KnowledgeBase();
    const provider = new MockLLMProvider([HAPPY_JSON]);
    const huge = "x".repeat(20_000);
    await extractFile({
      provider,
      kb,
      file: {
        path: "legacy.md",
        content: huge,
        mtime: 7,
        contentHash: "legacy-hash",
        origin: "user-note",
      },
      model: "gemma4:e4b-it-qat",
      charLimit: 1000,
      chunkingEnabled: false,
    });
    const prompt = provider.calls[0].prompt;
    expect(prompt).toContain("[... truncated ...]");
    expect(prompt.length).toBeLessThan(20_000);
    // Only one call was made.
    expect(provider.calls).toHaveLength(1);
  });
});