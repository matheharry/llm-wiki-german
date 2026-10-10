import { describe, it, expect } from "vitest";
import { rankByKeyword } from "../../src/query/keyword-ranker.js";
import { KnowledgeBase } from "../../src/core/kb.js";

function buildKB() {
  const kb = new KnowledgeBase();
  kb.addEntity({
    name: "Alan Watts",
    type: "person",
    aliases: ["Watts"],
    facts: [
      "British philosopher who wrote about zen",
      "Author of The Way of Zen",
    ],
    source: "Books/Watts.md",
  });
  kb.addEntity({
    name: "Andrej Karpathy",
    type: "person",
    aliases: [],
    facts: ["AI researcher"],
    source: "Learn/Karpathy.md",
  });
  kb.addEntity({
    name: "Lonely",
    type: "other",
    aliases: [],
    facts: ["unrelated"],
    source: "x.md",
  });
  return kb;
}

describe("rankByKeyword", () => {
  it("ranks the entity whose name matches first", () => {
    const kb = buildKB();
    const ranked = rankByKeyword(kb, ["alan", "watts"]);
    expect(ranked[0]?.id).toBe("alan-watts");
    expect(ranked[0]?.score).toBeGreaterThan(0);
  });

  it("gives bigram boost when consecutive terms appear in name", () => {
    const kb = buildKB();
    const noBigram = rankByKeyword(kb, ["alan", "karpathy"]);
    const withBigram = rankByKeyword(kb, ["alan", "watts"]);
    const wattsScoreNoBi = noBigram.find((r) => r.id === "alan-watts")!.score;
    const wattsScoreBi = withBigram.find((r) => r.id === "alan-watts")!.score;
    expect(wattsScoreBi).toBeGreaterThan(wattsScoreNoBi);
  });

  it("matches fact substrings for 1 point each", () => {
    const kb = buildKB();
    const ranked = rankByKeyword(kb, ["philosopher"]);
    const hit = ranked.find((r) => r.id === "alan-watts");
    expect(hit?.score).toBe(1);
  });

  it("returns empty for empty terms", () => {
    expect(rankByKeyword(buildKB(), [])).toEqual([]);
  });

  it("weights rare terms higher than common terms across the KB", () => {
    const kb = new KnowledgeBase();
    // Common term appears in 3 entities
    kb.addEntity({ name: "Entity 1", type: "other", facts: ["common topic"], source: "1.md" });
    kb.addEntity({ name: "Entity 2", type: "other", facts: ["common topic"], source: "2.md" });
    kb.addEntity({ name: "Entity 3", type: "other", facts: ["common topic"], source: "3.md" });
    // Rare term appears in only 1 entity
    kb.addEntity({ name: "Specialized", type: "other", facts: ["unique term"], source: "4.md" });

    // Multi-term query: "common" vs "unique"
    const ranked = rankByKeyword(kb, ["common", "unique"]);
    const special = ranked.find((r) => r.id === "specialized");
    const e1 = ranked.find((r) => r.id === "entity-1");
    // "unique" has lower df than "common", so "specialized" should score higher than "entity-1"
    expect(special!.score).toBeGreaterThan(e1!.score);
  });
});

