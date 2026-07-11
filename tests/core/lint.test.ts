import { describe, it, expect } from "vitest";
import { wordSimilarity, buildEnumerationGroups } from "../../src/core/lint.js";

describe("wordSimilarity", () => {
  it("returns 0 for completely different facts", () => {
    expect(wordSimilarity("Der Autor wurde 1970 geboren", "Verlegt beim Springer Verlag")).toBeLessThan(0.1);
  });

  it("returns high similarity for near-identical facts", () => {
    expect(
      wordSimilarity(
        "Wurde 1970 in Berlin geboren",
        "Wurde 1970 in München geboren",
      ),
    ).toBeGreaterThan(0.5);
  });
});

describe("buildEnumerationGroups", () => {
  it("groups facts sharing the same 2-word prefix", () => {
    const facts = [
      "Verlegt \"Maschinelles Lernen\" von Max Mustermann (2020)",
      "Verlegt \"Neuronale Netze\" von Anna Schmidt (2021)",
      "Verlegt \"Deep Learning\" von Klaus Meier (2022)",
      "Gegründet im Jahr 1842 in Berlin",
    ];
    const groups = buildEnumerationGroups(facts);
    // First three share prefix "verlegt" (first 2 tokens)
    expect(groups.get(0)).toBe(groups.get(1));
    expect(groups.get(1)).toBe(groups.get(2));
    // The last fact is alone – not in any group
    expect(groups.has(3)).toBe(false);
  });

  it("does not group facts when prefix appears only once", () => {
    const facts = [
      "Schrieb das Buch \"KI im Alltag\"",
      "Arbeitet an der TU Berlin",
      "Erhielt den Preis für KI-Forschung",
    ];
    const groups = buildEnumerationGroups(facts);
    expect(groups.size).toBe(0);
  });

  it("correctly handles two separate enumeration groups", () => {
    const facts = [
      "Verlegt \"Buch A\" von Autor A",
      "Verlegt \"Buch B\" von Autor B",
      "Schrieb \"Roman X\" im Jahr 2010",
      "Schrieb \"Roman Y\" im Jahr 2015",
    ];
    const groups = buildEnumerationGroups(facts);
    // Group 1: indices 0, 1 (prefix "verlegt")
    expect(groups.get(0)).toBe(groups.get(1));
    // Group 2: indices 2, 3 (prefix "schrieb")
    expect(groups.get(2)).toBe(groups.get(3));
    // The two groups are distinct
    expect(groups.get(0)).not.toBe(groups.get(2));
  });

  it("enumeration groups suppress false-positive duplicate warnings in lint", () => {
    // Shorter facts with more structural overlap produce Jaccard >= 0.51.
    // shared: "veröffentlichte", "das", "buch", "verlag" (4) / union 6 → 0.667
    const facts = [
      "Veröffentlichte das Buch im Springer Verlag",
      "Veröffentlichte das Buch im Heise Verlag",
    ];
    const groups = buildEnumerationGroups(facts);
    const sim = wordSimilarity(facts[0], facts[1]);

    // Without group check this would fire (many shared structure words)
    expect(sim).toBeGreaterThanOrEqual(0.51);

    // With group check the pair is suppressed because both share prefix "veröffentlichte das"
    const groupI = groups.get(0);
    const groupJ = groups.get(1);
    const shouldSkip = groupI !== undefined && groupI === groupJ;
    expect(shouldSkip).toBe(true);
  });
});
