import { describe, it, expect } from "vitest";
import { extractQueryTerms } from "../../src/query/terms.js";

describe("extractQueryTerms", () => {
  it("lowercases and tokenizes a question", () => {
    // "alan" -> stem "ala" (n removed)
    const terms = extractQueryTerms("Who is Alan Watts?");
    expect(terms).toContain("alan");
    expect(terms).toContain("ala");
    expect(terms).toContain("watts");
  });

  it("drops common English stop words", () => {
    expect(extractQueryTerms("what is the meaning of zen")).toContain("meaning");
    expect(extractQueryTerms("what is the meaning of zen")).toContain("zen");
  });

  it("dedupes while preserving order", () => {
    // "more" -> stem "mor"
    const terms = extractQueryTerms("zen and zen and more zen");
    expect(terms[0]).toBe("zen");
    expect(terms[1]).toBe("more");
    expect(terms[2]).toBe("mor");
  });

  it("strips punctuation", () => {
    // "please" -> stem: "pleas" (e removed)
    expect(extractQueryTerms("Karpathy's videos, please!")).toContain("karpathy");
    expect(extractQueryTerms("Karpathy's videos, please!")).toContain("videos");
    expect(extractQueryTerms("Karpathy's videos, please!")).toContain("pleas");
  });

  it("returns empty for empty input", () => {
    expect(extractQueryTerms("")).toEqual([]);
    expect(extractQueryTerms("   ")).toEqual([]);
  });

  it("drops common German stop words", () => {
    const terms = extractQueryTerms("Wer ist Dominique Leca?");
    expect(terms).toContain("dominique");
    expect(terms).toContain("leca");
  });

  it("preserves German umlauts in terms", () => {
    expect(extractQueryTerms("Bücher über Zen")).toEqual(["bücher", "buch", "zen"]);
  });

  it("stems German words", () => {
    // "Bücher" -> original: "bücher", stem: "buch"
    expect(extractQueryTerms("Bücher")).toContain("buch");
    // "Häuser" -> original: "häuser", stem: "haus"
    expect(extractQueryTerms("Häuser")).toContain("haus");
    // "laufen" -> original: "laufen", stem: "lauf"
    expect(extractQueryTerms("laufen")).toContain("lauf");
  });

  it("splits German compound words", () => {
    // "Wissensbasis" -> "wissen", "basis"
    const terms = extractQueryTerms("Wissensbasis");
    expect(terms).toContain("wissen");
    expect(terms).toContain("basis");
  });
});
