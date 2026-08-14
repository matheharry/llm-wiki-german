import { describe, it, expect } from "vitest";
import {
  entityFrontmatter,
  conceptFrontmatter,
  sourceFrontmatter,
  serializeFrontmatter,
  toFirstSentence,
} from "../../src/pages/frontmatter.js";
import type { Entity, Concept, SourceRecord } from "../../src/core/types.js";

const TODAY = "2026-04-07";

describe("toFirstSentence", () => {
  it("extracts the first sentence ending in . ! or ?", () => {
    expect(
      toFirstSentence(
        "Erster Satz. Zweiter Satz mit mehr Inhalt.",
      ),
    ).toBe("Erster Satz.");
    expect(
      toFirstSentence("Single sentence without ending"),
    ).toBe("Single sentence without ending");
    expect(toFirstSentence("")).toBe("");
  });
});

const ENTITY: Entity = {
  id: "alan-watts",
  name: "Alan Watts",
  type: "person",
  aliases: ["A.W. Watts"],
  facts: [],
  sources: ["Books/Watts.md", "Learn/Zen.md"],
};

const CONCEPT: Concept = {
  id: "zen",
  name: "Zen",
  definition: "Direct experience",
  related: [],
  sources: ["Books/Watts.md", "Learn/Zen.md"],
};

const SOURCE: SourceRecord = {
  id: "Books/Watts.md",
  summary: "Notes on Alan Watts",
  date: "2026-03-01",
  mtime: 123,
  origin: "user-note",
};

describe("entityFrontmatter", () => {
  it("passes Bases validation", () => {
    // Basics: must be an object
    const fm = entityFrontmatter(ENTITY, TODAY);
    expect(typeof fm).toBe("object");
    expect(fm).not.toBeNull();
  });

  it("sets typ to entität", () => {
    const fm = entityFrontmatter(ENTITY, TODAY);
    expect(fm["typ"]).toBe("entität");
  });

  it("sets entitäts-typ to the entity's type", () => {
    const fm = entityFrontmatter(ENTITY, TODAY);
    expect(fm["entitäts-typ"]).toBe("person");
  });

  it("sets aliases as a list", () => {
    const fm = entityFrontmatter(ENTITY, TODAY);
    expect(Array.isArray(fm["aliases"])).toBe(true);
    expect(fm["aliases"]).toContain("A.W. Watts");
  });

  it("sets tags as a list containing llm-wiki/entity and entity-type tag", () => {
    const fm = entityFrontmatter(ENTITY, TODAY);
    expect(Array.isArray(fm["tags"])).toBe(true);
    expect(fm["tags"]).toContain("llm-wiki/entity");
    expect(fm["tags"]).toContain("llm-wiki/entity/person");
  });

  it("sets quellen-anzahl as an integer", () => {
    const fm = entityFrontmatter(ENTITY, TODAY);
    expect(fm["quellen-anzahl"]).toBe(2);
  });

  it("sets aktualisiert to TODAY", () => {
    const fm = entityFrontmatter(ENTITY, TODAY);
    expect(fm["aktualisiert"]).toBe(TODAY);
  });

  it("uses generatedAt when present instead of today", () => {
    const e = { ...ENTITY, generatedAt: "2026-01-15" };
    const fm = entityFrontmatter(e, TODAY);
    expect(fm["aktualisiert"]).toBe("2026-01-15");
    expect(fm["generated"]).toEqual({
      by: "llm-wiki-german/1.1.0c",
      at: "2026-01-15T00:00:00Z",
    });
  });

  it("keeps generatedAt stable even when today differs", () => {
    const e = { ...ENTITY, generatedAt: "2026-01-15" };
    const fm = entityFrontmatter(e, "2026-04-07");
    expect(fm["aktualisiert"]).toBe("2026-01-15");
  });

  it("sets cssclasses to empty list", () => {
    const fm = entityFrontmatter(ENTITY, TODAY);
    expect(fm["cssclasses"]).toEqual([]);
  });

  it("handles entity with no aliases", () => {
    const e = { ...ENTITY, aliases: [] };
    const fm = entityFrontmatter(e, TODAY);
    expect(fm["aliases"]).toEqual([]);
  });
});

describe("conceptFrontmatter", () => {
  it("passes Bases validation", () => {
    const fm = conceptFrontmatter(CONCEPT, TODAY);
    expect(typeof fm).toBe("object");
  });

  it("sets typ to konzept", () => {
    const fm = conceptFrontmatter(CONCEPT, TODAY);
    expect(fm["typ"]).toBe("konzept");
  });

  it("sets quellen-anzahl as an integer", () => {
    const fm = conceptFrontmatter(CONCEPT, TODAY);
    expect(fm["quellen-anzahl"]).toBe(2);
  });

  it("sets tags as a list", () => {
    const fm = conceptFrontmatter(CONCEPT, TODAY);
    expect(fm["tags"]).toContain("llm-wiki/concept");
  });

  it("sets aliases to empty list", () => {
    const fm = conceptFrontmatter(CONCEPT, TODAY);
    expect(fm["aliases"]).toEqual([]);
  });

  it("sets cssclasses to empty list", () => {
    const fm = conceptFrontmatter(CONCEPT, TODAY);
    expect(fm["cssclasses"]).toEqual([]);
  });

  it("sets aktualisiert to TODAY", () => {
    const fm = conceptFrontmatter(CONCEPT, TODAY);
    expect(fm["aktualisiert"]).toBe(TODAY);
  });

  it("uses generatedAt when present instead of today", () => {
    const c = { ...CONCEPT, generatedAt: "2026-02-20" };
    const fm = conceptFrontmatter(c, TODAY);
    expect(fm["aktualisiert"]).toBe("2026-02-20");
    expect(fm["generated"]).toEqual({
      by: "llm-wiki-german/1.1.0c",
      at: "2026-02-20T00:00:00Z",
    });
  });

  it("keeps generatedAt stable even when today differs", () => {
    const c = { ...CONCEPT, generatedAt: "2026-02-20" };
    const fm = conceptFrontmatter(c, "2026-04-07");
    expect(fm["aktualisiert"]).toBe("2026-02-20");
  });
});

describe("sourceFrontmatter", () => {
  it("passes Bases validation", () => {
    const fm = sourceFrontmatter(SOURCE);
    expect(typeof fm).toBe("object");
  });

  it("sets typ to quelle", () => {
    const fm = sourceFrontmatter(SOURCE);
    expect(fm["typ"]).toBe("quelle");
  });

  it("sets herkunft", () => {
    const fm = sourceFrontmatter(SOURCE);
    expect(fm["herkunft"]).toBe("user-note");
  });

  it("sets datum field (ISO, not aktualisiert)", () => {
    const fm = sourceFrontmatter(SOURCE);
    expect(fm["datum"]).toBe("2026-03-01");
  });

  it("sets tags as a list", () => {
    const fm = sourceFrontmatter(SOURCE);
    expect(fm["tags"]).toContain("llm-wiki/source");
  });

  it("sets aliases to empty list", () => {
    const fm = sourceFrontmatter(SOURCE);
    expect(fm["aliases"]).toEqual([]);
  });

  it("sets cssclasses to empty list", () => {
    const fm = sourceFrontmatter(SOURCE);
    expect(fm["cssclasses"]).toEqual([]);
  });
});

describe("serializeFrontmatter", () => {
  it("wraps output in --- delimiters", () => {
    const out = serializeFrontmatter({ a: 1 });
    expect(out).toMatch(/^---\n/);
    expect(out).toMatch(/\n---\n$/);
  });

  it("serializes string values", () => {
    const out = serializeFrontmatter({ name: "Alan" });
    expect(out).toContain("name: Alan\n");
  });

  it("serializes empty array as []", () => {
    const out = serializeFrontmatter({ aliases: [] });
    expect(out).toContain("aliases: []\n");
  });

  it("serializes non-empty array as YAML list", () => {
    const out = serializeFrontmatter({ tags: ["a", "b"] });
    expect(out).toContain("tags:\n  - a\n  - b\n");
  });

  it("serializes integer values", () => {
    const out = serializeFrontmatter({ count: 42 });
    expect(out).toContain("count: 42\n");
  });

  it("quotes string values containing colons", () => {
    const out = serializeFrontmatter({ title: "Zen: A Way of Life" });
    expect(out).toContain('title: "Zen: A Way of Life"\n');
  });

  it("defaults today to current ISO date when not provided", () => {
    const fm = entityFrontmatter(ENTITY);
    const expected = new Date().toISOString().slice(0, 10);
    expect(fm["aktualisiert"]).toBe(expected);
  });
});