import { describe, it, expect } from "vitest";
import {
  RETRIEVAL_ENTITY_BLACKLIST,
  RETRIEVAL_CONCEPT_BLACKLIST,
  createQualityMultiplier,
  qualityMultiplier,
  detectTypeHint,
} from "../../src/query/quality.js";
import { KnowledgeBase } from "../../src/core/kb.js";

describe("blacklists", () => {
  it("includes the known bad names", () => {
    expect(RETRIEVAL_ENTITY_BLACKLIST.has("exact name")).toBe(true);
    expect(RETRIEVAL_CONCEPT_BLACKLIST.has("address book")).toBe(true);
  });
});

describe("qualityMultiplier", () => {
  function kbWith(facts: number, sources: string[]): KnowledgeBase {
    const kb = new KnowledgeBase();
    kb.addEntity({
      name: "X",
      type: "person",
      aliases: [],
      facts: Array.from({ length: facts }, (_, i) => `f${i}`),
      source: sources[0] ?? "Other/x.md",
    });
    for (let i = 1; i < sources.length; i++) {
      kb.addEntity({
        name: "X",
        type: "person",
        aliases: [],
        facts: [],
        source: sources[i],
      });
    }
    return kb;
  }

  it("boosts entities with >=3 facts", () => {
    const kb = kbWith(3, ["Books/x.md"]);
    expect(qualityMultiplier("x", kb)).toBeGreaterThan(1.0);
  });

  it("penalises entities with 0 facts", () => {
    const kb = kbWith(0, ["Books/x.md"]);
    expect(qualityMultiplier("x", kb)).toBeLessThan(1.0);
  });

  it("penalises twitter-only sources", () => {
    const kb = kbWith(2, ["Twitter/a.md", "Twitter/b.md"]);
    expect(qualityMultiplier("x", kb)).toBeLessThan(1.0);
  });
});

describe("createQualityMultiplier", () => {
  it("matches qualityMultiplier for entity, concept, and source ids", () => {
    const kb = new KnowledgeBase();
    kb.addEntity({
      name: "Rich Entity",
      type: "person",
      aliases: ["Rich"],
      facts: ["a", "b", "c"],
      source: "Books/rich.md",
    });
    kb.addEntity({
      name: "Thin Entity",
      type: "person",
      aliases: [],
      facts: [],
      source: "Twitter/x.md",
    });
    kb.addConcept({
      name: "Zen",
      definition: "A school of Buddhism",
      related: ["meditation"],
      source: "Books/rich.md",
    });
    kb.markSource({
      path: "Books/rich.md",
      summary: "A rich source",
      mtime: 1,
      origin: "user-note",
    });

    const entities = new Map(kb.allEntities().map((e) => [e.id, e]));
    const concepts = new Map(kb.allConcepts().map((c) => [c.id, c]));
    const sources = new Map(kb.allSources().map((s) => [s.id, s]));
    const multiplier = createQualityMultiplier({ entities, concepts, sources });

    const ids = [
      "rich-entity",
      "thin-entity",
      "concept:zen",
      "source:Books/rich.md",
      "missing-id",
    ];
    for (const id of ids) {
      expect(multiplier(id)).toBe(qualityMultiplier(id, kb));
    }
  });
});

describe("detectTypeHint", () => {
  it("maps plurals and synonyms to entity types", () => {
    expect(detectTypeHint(["books"])).toBe("book");
    expect(detectTypeHint(["people"])).toBe("person");
    expect(detectTypeHint(["companies"])).toBe("org");
  });
  it("returns null when no type hint present", () => {
    expect(detectTypeHint(["random", "words"])).toBeNull();
  });
});
