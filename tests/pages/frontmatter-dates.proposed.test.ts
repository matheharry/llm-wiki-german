import { describe, it, expect } from "vitest";
import { entityFrontmatter, conceptFrontmatter } from "../../src/pages/frontmatter.js";
import type { Concept, Entity } from "../../src/core/types.js";

describe("Frontmatter: aktualisiert vs. erstellt", () => {
  it("Entity mit updatedAt -> aktualisiert=updatedAt, erstellt=generatedAt", () => {
    const e: Entity = {
      id: "test",
      name: "Test",
      type: "person",
      aliases: [],
      facts: ["Fakt 1"],
      generatedAt: "2026-01-01",
      updatedAt: "2026-10-22",
      sources: ["s.md"],
    };
    const fm = entityFrontmatter(e);
    expect(fm["aktualisiert"]).toBe("2026-10-22");
    expect(fm["erstellt"]).toBe("2026-01-01");
  });

  it("Concept mit updatedAt -> aktualisiert=updatedAt, erstellt=generatedAt", () => {
    const c: Concept = {
      id: "test",
      name: "Test",
      definition: "Def",
      generatedAt: "2026-01-01",
      updatedAt: "2026-10-22",
      related: [],
      sources: ["s.md"],
    };
    const fm = conceptFrontmatter(c);
    expect(fm["aktualisiert"]).toBe("2026-10-22");
    expect(fm["erstellt"]).toBe("2026-01-01");
  });

  it("Legacy ohne updatedAt -> aktualisiert=generatedAt, erstellt=generatedAt", () => {
    const e: Entity = {
      id: "t",
      name: "T",
      type: "person",
      aliases: [],
      facts: ["F"],
      generatedAt: "2026-01-01",
      sources: ["s.md"],
    };
    const fm = entityFrontmatter(e);
    expect(fm["aktualisiert"]).toBe("2026-01-01");
    expect(fm["erstellt"]).toBe("2026-01-01");
  });

  it("erstellt bleibt stabil, aktualisiert wandert mit jedem Merge", () => {
    // Der Kern des Fixes: `aktualisiert` wurde zuvor aus `generatedAt`
    // gespeist, obwohl dieses Feld nur beim ERSTEN Anlegen gesetzt wird.
    // Ein Merge musste das Datum also nie fortschreiben.
    const e: Entity = {
      id: "t",
      name: "T",
      type: "person",
      aliases: [],
      facts: ["F"],
      generatedAt: "2026-01-01",
      sources: ["s.md"],
    };
    const fm = entityFrontmatter(e);
    expect(fm["erstellt"]).toBe("2026-01-01");
    expect(fm["aktualisiert"]).toBe("2026-01-01");
    // `generated.at` bleibt das Erstellungsdatum.
    expect(fm["generated"]).toEqual({
      by: "llm-wiki-german/1.1.0c",
      at: "2026-01-01T00:00:00Z",
    });
  });
});
