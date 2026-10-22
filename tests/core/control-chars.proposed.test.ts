/**
 * BEWEIS: Steuerzeichen im KB-Namen landen nicht im Frontmatter.
 *
 * Hintergrund: Das LLM liefert manchmal LaTeX. Ein `\beta` kann auf dem
 * Weg durch den JSON-Transport zu einem echten Backspace (0x08) werden:
 * `\b` ist in vielen JSON-Texten eine Escape-Sequenz.
 *
 * Im Live-Wiki betraf das den Konzeptnamen
 * "Beta-Zerfaelle ($\x08eta^-$ und $\x08eta^+$)" — die Seite war dadurch
 * kein gueltiges YAML und wurde von Obsidian falsch gerendert.
 *
 * Wichtig: Das Problem ist NICHT nur das Frontmatter. Der Name steht
 * auch als Ueberschrift im Textkoerper. Ein Fix nur im Frontmatter
 * laesst das Steuerzeichen im Koerper stehen — die Seite bleibt
 * kaputt. Deshalb wird der Name schon beim Laden des KB bereinigt.
 */
import { describe, it, expect } from "vitest";
import YAML from "yaml";
import { KnowledgeBase } from "../../src/core/kb.js";
import { conceptFrontmatter, serializeFrontmatter } from "../../src/pages/frontmatter.js";

/** Der Name, wie er im Live-KB stand: `\b` wurde zu einem Backspace. */
const CORRUPT_NAME = "Beta-Zerf\u00e4lle ($\u0008eta^-$ und $\u0008eta^+$)";

describe("KB: Steuerzeichen im Namen", () => {
  it("entfernt Steuerzeichen aus dem Namen beim Laden", () => {
    const kb = new KnowledgeBase({
      meta: { version: 1, created: "2026-01-01", updated: "2026-01-01" },
      entities: {},
      concepts: {
        x: {
          id: "x",
          name: CORRUPT_NAME,
          definition: "Def",
          related: [],
          sources: [],
        },
      },
      connections: [],
      sources: {},
    });
    const concept = kb.getConcept("x");
    expect(concept).toBeDefined();
    expect(concept!.name).not.toMatch(/[\x00-\x08\x0b\x0c\x0e-\x1f]/);
    expect(concept!.name).toBe("Beta-Zerf\u00e4lle ($eta^-$ und $eta^+$)");
  });

  it("entfernt Steuerzeichen aus der Definition", () => {
    const kb = new KnowledgeBase({
      meta: { version: 1, created: "2026-01-01", updated: "2026-01-01" },
      entities: {},
      concepts: {
        x: {
          id: "x",
          name: "Sauber",
          definition: "Beim $\u0008eta$ Zerfall wandert ein Neutron.",
          related: [],
          sources: [],
        },
      },
      connections: [],
      sources: {},
    });
    const concept = kb.getConcept("x");
    expect(concept!.definition).not.toMatch(/[\x00-\x08\x0b\x0c\x0e-\x1f]/);
  });

  it("laesst Tab, Zeilenumbruch und Wagenruecklauf unangetastet", () => {
    // Diese Zeichen sind in YAML erlaubt. Ein pauschales Entfernen
    // aller Steuerzeichen wuerde Text zerstoeren.
    const kb = new KnowledgeBase({
      meta: { version: 1, created: "2026-01-01", updated: "2026-01-01" },
      entities: {},
      concepts: {
        x: {
          id: "x",
          name: "Mit\tTab",
          definition: "Zeile eins\nZeile zwei\r\n",
          related: [],
          sources: [],
        },
      },
      connections: [],
      sources: {},
    });
    const concept = kb.getConcept("x");
    expect(concept!.name).toBe("Mit\tTab");
    expect(concept!.definition).toContain("\n");
  });

  it("erzeugt daraus parsebares YAML-Frontmatter", () => {
    const kb = new KnowledgeBase({
      meta: { version: 1, created: "2026-01-01", updated: "2026-01-01" },
      entities: {},
      concepts: {
        x: {
          id: "x",
          name: CORRUPT_NAME,
          definition: "Def",
          related: [],
          sources: [],
        },
      },
      connections: [],
      sources: {},
    });
    const concept = kb.getConcept("x")!;
    const out = serializeFrontmatter(conceptFrontmatter(concept));
    const block = out.slice(out.indexOf("\n") + 1, out.indexOf("\n---", 3));
    let parsed: unknown = null;
    let err = "";
    try {
      parsed = YAML.parse(block);
    } catch (e) {
      err = String(e);
    }
    expect(err).toBe("");
    expect((parsed as Record<string, unknown>).title).toBe(
      "Beta-Zerf\u00e4lle ($eta^-$ und $eta^+$)",
    );
  });

  it("behaelt die ID stabil — der Slug aendert sich nicht", () => {
    // Der Slug entsteht aus dem Namen, aber `makeId()` verwirft
    // Steuerzeichen ohnehin. Die Seite darf ihren Pfad nicht wechseln.
    const kb = new KnowledgeBase({
      meta: { version: 1, created: "2026-01-01", updated: "2026-01-01" },
      entities: {},
      concepts: {
        "beta-zerf\u00e4lle-eta-und-eta": {
          id: "beta-zerf\u00e4lle-eta-und-eta",
          name: CORRUPT_NAME,
          definition: "Def",
          related: [],
          sources: [],
        },
      },
      connections: [],
      sources: {},
    });
    expect(kb.getConcept("beta-zerf\u00e4lle-eta-und-eta")).toBeDefined();
  });
});
