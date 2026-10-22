/**
 * BEWEIS: die Aufloesung der `related`-Verweise ist kumulativ und
 * idempotent.
 *
 * Zwo Fehler, die dieser Test verhindert:
 *
 * 1. `unresolvedRelated` wurde beim zweiten Aufloesungslauf ignoriert.
 *    Die unaufgeloesten Namen standen dann weder in `related` noch in
 *    `unresolvedRelated` — sie waren fuer immer verloren. Der Verweis
 *    auf ein Ziel, das spaeter entsteht, wurde nie aufgeloest.
 *
 * 2. `removeSource()` loeschte Eintraege, deren letzte Quelle
 *    verschwunden war. Das war stiller Wissensverlust: die Seite
 *    verschwand, und jeder Verweis auf sie wurde sofort zu einem toten
 *    Link. (Siehe `orphaned-sources.proposed.test.ts`.)
 */
import { describe, it, expect } from "vitest";
import { KnowledgeBase } from "../../src/core/kb.js";

describe("related-Aufloesung: kumulativ und idempotent", () => {
  it("behaelt einen unaufgeloest gebliebenen Verweis ueber mehrere Laeufe", () => {
    const kb = new KnowledgeBase();
    kb.addConcept({
      name: "Aggregatzustand",
      definition: "Ein Zustand der Materie.",
      related: ["Gas", "FehltNochNicht"],
      source: "a.md",
    });

    // Erster Lauf: "Gas" gibt es nicht, "FehltNochNicht" auch nicht.
    const first = kb.resolveAllRelated();
    expect(first.resolved).toBe(0);
    expect(first.unresolved).toBe(2);
    expect(kb.getConcept("aggregatzustand")!.unresolvedRelated).toEqual([
      "Gas",
      "FehltNochNicht",
    ]);

    // Zweiter Lauf: OHNE das Ziel darf nichts verloren gehen.
    const second = kb.resolveAllRelated();
    expect(second.unresolved).toBe(first.unresolved);
    expect(kb.getConcept("aggregatzustand")!.unresolvedRelated).toEqual([
      "Gas",
      "FehltNochNicht",
    ]);

    // Dritter Lauf: dasselbe Bild.
    const third = kb.resolveAllRelated();
    expect(third.unresolved).toBe(first.unresolved);
    expect(third.resolved).toBe(first.resolved);
  });

  it("loest einen Verweis auf, sobald das Ziel existiert", () => {
    const kb = new KnowledgeBase();
    kb.addConcept({
      name: "Aggregatzustand",
      definition: "Ein Zustand der Materie.",
      related: ["Gas"],
      source: "a.md",
    });
    expect(kb.resolveAllRelated().unresolved).toBe(1);

    // Das Ziel entsteht spaeter — z.B. durch eine spaetere Extraktion.
    kb.addConcept({
      name: "Gas",
      definition: "Ein Aggregatzustand.",
      source: "b.md",
    });
    const after = kb.resolveAllRelated();
    expect(after.resolved).toBe(1);
    expect(after.unresolved).toBe(0);
    const concept = kb.getConcept("aggregatzustand")!;
    expect(concept.related).toEqual(["gas"]);
    expect(concept.unresolvedRelated).toEqual([]);
  });

  it("aendert beim zweiten Lauf nichts am KB", () => {
    const kb = new KnowledgeBase();
    kb.addConcept({
      name: "Aggregatzustand",
      definition: "Ein Zustand der Materie.",
      related: ["Gas", "Alan Watts"],
      source: "a.md",
    });
    kb.addConcept({
      name: "Alan Watts",
      definition: "Ein Autor.",
      source: "a.md",
    });
    kb.resolveAllRelated();
    const snapshot = JSON.stringify(kb.data.concepts);
    kb.resolveAllRelated();
    expect(JSON.stringify(kb.data.concepts)).toBe(snapshot);
  });

  it("behaelt das Wissen, wenn die letzte Quelle verschwindet", () => {
    const kb = new KnowledgeBase();
    kb.markSource({
      path: "a.md",
      mtime: 1,
      origin: "user-note",
      summary: "x",
    });
    kb.addConcept({
      name: "Aggregatzustand",
      definition: "Ein Zustand der Materie (z.B. Feststoff, Fluessig).",
      source: "a.md",
    });
    kb.addEntity({
      name: "Alan Watts",
      type: "person",
      facts: ["Alan Watts war ein Autor."],
      source: "a.md",
    });
    kb.removeSource("a.md");
    // Die Definition bleibt — nur die Zitation verschwindet.
    const concept = kb.getConcept("aggregatzustand");
    expect(concept).toBeDefined();
    expect(concept!.definition).toBe(
      "Ein Zustand der Materie (z.B. Feststoff, Fluessig).",
    );
    expect(concept!.sources).toEqual([]);
    // Dasselbe gilt fuer Entities — der Pfad ist ein eigener.
    const entity = kb.getEntity("alan-watts");
    expect(entity).toBeDefined();
    expect(entity!.facts).toEqual(["Alan Watts war ein Autor."]);
    expect(entity!.sources).toEqual([]);
  });
});
