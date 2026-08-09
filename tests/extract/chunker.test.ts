import { describe, it, expect } from "vitest";
import { splitIntoChunks } from "../../src/extract/chunker.js";

describe("splitIntoChunks", () => {
  it("returns a single chunk when content fits within the limit", () => {
    const content = "Kurzer Text.";
    const chunks = splitIntoChunks(content, { chunkSize: 100, overlapChars: 0 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].index).toBe(1);
    expect(chunks[0].text).toBe(content);
    expect(chunks[0].startOffset).toBe(0);
  });

  it("returns an empty array for empty content", () => {
    expect(splitIntoChunks("", { chunkSize: 100 })).toEqual([]);
  });

  it("splits long content into multiple chunks", () => {
    const paragraphs = Array.from(
      { length: 10 },
      (_, i) => `Absatz ${i + 1}. ${"x".repeat(500)}`,
    );
    const content = paragraphs.join("\n\n");
    const chunks = splitIntoChunks(content, {
      chunkSize: 800,
      overlapChars: 0,
      maxChunks: 20,
    });
    expect(chunks.length).toBeGreaterThan(1);
    // First chunk starts at offset 0
    expect(chunks[0].startOffset).toBe(0);
    // All chunks are non-empty
    for (const c of chunks) {
      expect(c.text.trim().length).toBeGreaterThan(0);
      expect(c.index).toBeGreaterThan(0);
    }
  });

  it("does not cut inside a fenced code block", () => {
    const codeBlock = "```js\n" + "const a = 1;\n".repeat(100) + "```";
    const filler = "Text darunter. ".repeat(400);
    const content = `${codeBlock}\n\n${filler}`;
    const chunks = splitIntoChunks(content, {
      chunkSize: 300,
      overlapChars: 0,
      maxChunks: 20,
    });
    // The code block must appear completely in one chunk.
    for (const c of chunks) {
      const idx = c.text.indexOf("```");
      if (idx !== -1) {
        // If the chunk contains any code fence, it must contain both open and close.
        const last = c.text.lastIndexOf("```");
        expect(idx).toBeLessThan(last);
      }
    }
  });

  it("keeps YAML frontmatter only in the first chunk", () => {
    const fm = "---\ntitle: Test\n---\n\n";
    const body = "Body-Text. ".repeat(1000);
    const content = fm + body;
    const chunks = splitIntoChunks(content, {
      chunkSize: 300,
      overlapChars: 0,
      maxChunks: 20,
    });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].text).toContain("title: Test");
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i].text).not.toContain("title: Test");
    }
  });

  it("applies overlap to later chunks", () => {
    const content = "A".repeat(2500);
    // With chunkSize 1000 and overlap 100, chunks 2+ must contain the tail of the previous chunk.
    const chunks = splitIntoChunks(content, {
      chunkSize: 1000,
      overlapChars: 100,
      maxChunks: 20,
    });
    expect(chunks.length).toBeGreaterThan(1);
    // Verify that the start of the overlap repeats the tail of the previous chunk.
    for (let i = 1; i < chunks.length; i++) {
      const prevTail = chunks[i - 1].text.slice(-100);
      expect(chunks[i].text.slice(0, 100)).toBe(prevTail);
    }
  });

  it("respects maxChunks and appends remaining content to the last chunk", () => {
    const content = "Absatz A\n\n" + "Absatz B\n\n" + "Absatz C\n\n" + "Absatz D\n\n";
    const chunks = splitIntoChunks(content, {
      chunkSize: 20,
      overlapChars: 5,
      maxChunks: 3,
    });
    expect(chunks.length).toBeLessThanOrEqual(3);
    // The tail of the document should still be present (appended with a marker).
    const allText = chunks.map((c) => c.text).join("");
    expect(allText).toContain("Absatz D");
    expect(allText).toContain("[weiterer Inhalt, aus Platzgründen gekürzt]");
  });
});