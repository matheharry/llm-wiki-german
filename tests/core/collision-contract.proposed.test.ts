/**
 * Vertrag des Kollisionsloesers.
 *
 * Dieser Test haelt fest, welche Entscheidungen
 * `resolveCrossNamespaceCollision()` ueberhaupt treffen kann. Er ist
 * wichtig, weil `kb.ts` die Rueckgabewerte als `if/else`-Kette
 * auswertet: ein Ziel, das der Resolver nie zurueckgibt, macht den
 * zugehoerigen Zweig zu totem Code.
 *
 * Aktueller Stand (gemessen, nicht angenommen):
 *   - newKind=entity  -> create/entity, create/concept, merge/concept
 *   - newKind=concept -> create/concept, merge/concept
 * `merge/entity` wird fuer ein NEUES KONZEPT nie zurueckgegeben. Der
 * Zweig `mergeConceptIntoEntity()` in kb.ts ist damit unerreichbar —
 * er ist aber nicht schaedlich: er ist korrekt implementiert und
 * greift, falls der Resolver diese Entscheidung spaeter einmal
 * liefert.
 */
import { describe, it, expect } from "vitest";
import { resolveCrossNamespaceCollision } from "../../src/core/collision.js";

const TYPES = [
  "person",
  "org",
  "tool",
  "project",
  "book",
  "article",
  "place",
  "event",
  "other",
];

const TEXTS = [
  "ist ein Begriff",
  "Wird verwendet, um neue Funktionen zu testen",
  "ein Werkzeug",
  "",
];

/** Alle Ergebnisse, die der Resolver fuer die Parameter liefert. */
function outcomes(
  newKind: "entity" | "concept",
): Set<string> {
  const results = new Set<string>();
  for (const t of TYPES) {
    for (const tx of TEXTS) {
      const d = resolveCrossNamespaceCollision({
        newId: "x",
        newName: "X",
        newKind,
        existingKind: newKind === "entity" ? "concept" : "entity",
        existingId: "x",
        existingName: "X",
        existingType: t,
        existingText: tx,
        newText: "neuer Text",
      });
      results.add(`${d.action}/${d.target}`);
    }
  }
  return results;
}

describe("Kollisionsloeser: moegliche Ziele", () => {
  it("liefert fuer ein neues Konzept niemals 'entity' als Ziel", () => {
    const o = outcomes("concept");
    expect([...o].some((r) => r.endsWith("/entity"))).toBe(false);
    // Das Konzept hat Vorrang oder es wird neu angelegt.
    expect([...o].sort()).toEqual(["create/concept", "merge/concept"]);
  });

  it("liefert fuer eine neue Entity 'concept' als Merge-Ziel", () => {
    const o = outcomes("entity");
    expect([...o]).toContain("merge/concept");
    // Aber nie "merge/entity" — die Entity kann nicht in sich selbst
    // gemergt werden.
    expect([...o].some((r) => r === "merge/entity")).toBe(false);
  });
});
