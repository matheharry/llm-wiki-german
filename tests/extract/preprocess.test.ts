import { describe, it, expect } from "vitest";
import {
  stripBase64Images,
  condenseCodeBlocks,
  truncateAtBoundary,
  preprocessContent,
} from "../../src/extract/preprocess.js";

describe("stripBase64Images", () => {
  it("replaces markdown image data-URIs with a placeholder", () => {
    const input =
      "Text before ![Bildergebnis für achtung](data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAcwBzAAD/2wBDAAoHBwgHBgo) text after";
    const result = stripBase64Images(input);
    expect(result).toContain("[Eingebettetes Bild]");
    expect(result).not.toContain("data:image");
    expect(result).not.toContain("base64");
    expect(result).toContain("Text before");
    expect(result).toContain("text after");
  });

  it("replaces bare data-URIs not wrapped in an image", () => {
    const input = "Some data:image/png;base64,AAAAABBBBBCCCC text";
    const result = stripBase64Images(input);
    expect(result).toContain("[Eingebettetes Bild]");
    expect(result).not.toContain("data:image");
  });

  it("handles multiple images", () => {
    const input =
      "![a](data:image/jpeg;base64,AAAA) middle ![b](data:image/png;base64,BBBB)";
    const result = stripBase64Images(input);
    expect(result.match(/\[Eingebettetes Bild\]/g)).toHaveLength(2);
  });

  it("leaves non-base64 content untouched", () => {
    const input = "Just plain text with ![alt](https://example.com/img.png)";
    const result = stripBase64Images(input);
    expect(result).toBe(input);
  });
});

describe("condenseCodeBlocks", () => {
  it("leaves short code blocks untouched", () => {
    const input = "```js\nconst x = 1;\n```";
    const result = condenseCodeBlocks(input);
    expect(result).toBe(input);
  });

  it("condenses long code blocks with a placeholder and context", () => {
    const lines = ["```html", ...Array.from({ length: 300 }, (_, i) => `line ${i}`), "```"];
    const input = lines.join("\n");
    const result = condenseCodeBlocks(input, { codeBlockMaxLines: 200, codeBlockContextLines: 5 });
    expect(result).toContain("[Codeblock: ~300 Zeilen, gekürzt]");
    expect(result).toContain("line 0");
    expect(result).toContain("line 4");
    expect(result).not.toContain("line 5");
    expect(result).not.toContain("line 299");
    expect(result).toContain("```html");
  });

  it("respects custom max lines", () => {
    const input = "```js\n" + Array.from({ length: 20 }, (_, i) => `x${i}`).join("\n") + "\n```";
    const result = condenseCodeBlocks(input, { codeBlockMaxLines: 10, codeBlockContextLines: 3 });
    expect(result).toContain("[Codeblock: ~20 Zeilen, gekürzt]");
  });

  it("handles code blocks with a space between backticks and language", () => {
    const lines = ["``` html", ...Array.from({ length: 250 }, (_, i) => `<div>${i}</div>`), "```"];
    const input = lines.join("\n");
    const result = condenseCodeBlocks(input, { codeBlockMaxLines: 200, codeBlockContextLines: 3 });
    expect(result).toContain("[Codeblock: ~250 Zeilen, gekürzt]");
    expect(result).toContain("<div>0</div>");
    expect(result).not.toContain("<div>249</div>");
  });
});

describe("truncateAtBoundary", () => {
  it("returns content unchanged when under the limit", () => {
    const input = "short text";
    expect(truncateAtBoundary(input, 100)).toBe(input);
  });

  it("truncates at a line boundary and appends the marker", () => {
    const input = "line1\nline2\nline3\nline4\nline5";
    const result = truncateAtBoundary(input, 15);
    expect(result).toContain("[... truncated ...]");
    // Should not split a line mid-way — every "lineN" is followed by a
    // newline or the truncation marker, never by partial content.
    expect(result).toMatch(/^line1\nline2\n\n\[\.\.\. truncated \.\.\.\]$/);
  });

  it("truncates mid-line when no newline is available in the first half", () => {
    const input = "x".repeat(100);
    const result = truncateAtBoundary(input, 50);
    expect(result).toContain("[... truncated ...]");
    expect(result.length).toBeLessThan(100);
  });
});

describe("preprocessContent", () => {
  it("strips base64, condenses code, and truncates in order", () => {
    const base64 = "/9j/4AAQSkZJRgABAQEAcwBzAAD/2wBDAAoHBwgHBgo";
    const codeLines = Array.from({ length: 300 }, (_, i) => `code line ${i}`);
    const input = [
      "Header text",
      `![img](data:image/jpeg;base64,${base64})`,
      "```html",
      ...codeLines,
      "```",
      "Footer text",
    ].join("\n");

    const result = preprocessContent(input, 150);
    expect(result).not.toContain("data:image");
    expect(result).not.toContain("base64");
    expect(result).toContain("[Eingebettetes Bild]");
    expect(result).toContain("[Codeblock: ~300 Zeilen, gekürzt]");
    expect(result).toContain("[... truncated ...]");
    expect(result).toContain("Header text");
  });

  it("keeps short content intact", () => {
    const input = "Just a short note about something.";
    const result = preprocessContent(input, 1000);
    expect(result).toBe(input);
  });
});