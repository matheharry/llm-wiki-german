import { describe, it, expect } from "vitest";
import { KnowledgeBase } from "../../src/core/kb.js";
import {
  buildRelatedIndex,
  resolveRelated,
  resolveRelatedName,
  normalizeRelatedName,
} from "../../src/core/related.js";

/**
 * `related` speicherte freie Namen, die beim Rendern per makeId() in einen
 * Slug umgewandelt wurden. makeId() ist verlustbehaftet ("Generative KI"
 * -> "generative-ki" ist ok, aber "Bezugspunkt (Datum)" ->
 * "bezugspunkt-datum" passt nicht auf die ID "bezugspunkt-datum-2").
 *
 * 2.803 von 11.176 Verweisen zeigten ins Leere.
 */
describe("normalizeRelatedName", () => {
  it("vereinheitlicht Leerzeichen und Unterstriche", () => {
    expect(normalizeRelatedName("Magic_8_ball Logic")).toBe(
      normalizeRelatedName("Magic 8 Ball Logic"),
    );
  });

  it("ignoriert Leerzeichen um Trennzeichen", () => {
    expect(normalizeRelatedName("Induktion / Induktionskochfeld")).toBe(
      "induktion/induktionskochfeld",
    );
  });

  it("beachtet die Gross-/Kleinschreibung nicht", () => {
    expect(normalizeRelatedName("GENERATIVE KI")).toBe(
      normalizeRelatedName("generative ki"),
    );
  });
});

describe("buildRelatedIndex", () => {
  const index = buildRelatedIndex([
    { id: "alan-watts", name: "Alan Watts" },
    { id: "generative-ki", name: "Generative KI" },
  ]);

  it("findet Eintraege ueber die ID", () => {
    expect(resolveRelatedName("alan-watts", index)).toBe("alan-watts");
  });

  it("findet Eintraege ueber den Namen", () => {
    expect(resolveRelatedName("Alan Watts", index)).toBe("alan-watts");
  });

  it("findet Eintraege trotz Unterstrich-Schreibweise", () => {
    expect(resolveRelatedName("Magic_8_ball", index)).toBeUndefined();
    const idx2 = buildRelatedIndex([
      { id: "magic8ball", name: "Magic_8_ball Logic/Implementation" },
    ]);
    expect(resolveRelatedName("Magic 8 Ball Logic/Implementation", idx2)).toBe(
      "magic8ball",
    );
  });

  it("liefert undefined fuer unbekannte Namen", () => {
    expect(resolveRelatedName("Gibt es nicht", index)).toBeUndefined();
  });
});

describe("resolveRelated", () => {
  const index = buildRelatedIndex([
    { id: "alan-watts", name: "Alan Watts" },
    { id: "zen-buddhism", name: "Zen Buddhism" },
  ]);

  it("trennt aufgeloeste und unaufgeloeste Namen", () => {
    const { resolved, unresolved } = resolveRelated(
      ["Alan Watts", "Nie Vorhanden", "Zen Buddhism"],
      index,
    );
    expect(resolved).toEqual(["alan-watts", "zen-buddhism"]);
    expect(unresolved).toEqual(["Nie Vorhanden"]);
  });

  it("entfernt Duplikate", () => {
    const { resolved, unresolved } = resolveRelated(
      ["Alan Watts", "alan-watts", "Alan Watts"],
      index,
    );
    expect(resolved).toEqual(["alan-watts"]);
    expect(unresolved).toEqual([]);
  });

  it("ignoriert leere Eintraege", () => {
    const { resolved, unresolved } = resolveRelated(["", "   "], index);
    expect(resolved).toEqual([]);
    expect(unresolved).toEqual([]);
  });
});

describe("KnowledgeBase.resolveAllRelated", () => {
  it("loest Namen gegen das vollstaendige KB auf", () => {
    const kb = new KnowledgeBase();
    kb.addEntity({ name: "Alan Watts", type: "person", facts: ["F."], source: "A.md" });
    kb.addConcept({
      name: "Zen Buddhism",
      definition: "D.",
      related: ["Alan Watts", "Unbekannter Begriff"],
    });

    const stats = kb.resolveAllRelated();
    expect(stats.resolved).toBe(1);
    expect(stats.unresolved).toBe(1);

    const concept = kb.getConcept("Zen Buddhism")!;
    expect(concept.related).toEqual(["alan-watts"]);
    expect(concept.unresolvedRelated).toEqual(["Unbekannter Begriff"]);
  });

  it("loest auch Ziele auf, die spaeter im selben Batch entstehen", () => {
    const kb = new KnowledgeBase();
    // Das Konzept kommt ZUERST, das Ziel erst danach.
    kb.addConcept({
      name: "Zen Buddhism",
      definition: "D.",
      related: ["Alan Watts"],
    });
    kb.addEntity({ name: "Alan Watts", type: "person", facts: ["F."], source: "A.md" });

    // Ohne resolveAllRelated wäre der Name unaufgelöst geblieben.
    const stats = kb.resolveAllRelated();
    expect(stats.resolved).toBe(1);
    expect(kb.getConcept("Zen Buddhism")!.related).toEqual(["alan-watts"]);
  });

  it("ist idempotent", () => {
    const kb = new KnowledgeBase();
    kb.addEntity({ name: "Alan Watts", type: "person", facts: ["F."], source: "A.md" });
    kb.addConcept({
      name: "Zen Buddhism",
      definition: "D.",
      related: ["Alan Watts", "Nichts"],
    });

    kb.resolveAllRelated();
    const first = kb.getConcept("Zen Buddhism")!.related.slice();
    kb.resolveAllRelated();
    expect(kb.getConcept("Zen Buddhism")!.related).toEqual(first);
  });

  it("behaelt Namen ohne Ziel als Klartext, ohne Link", () => {
    const kb = new KnowledgeBase();
    kb.addConcept({
      name: "Zen Buddhism",
      definition: "D.",
      related: ["Nie Angelegt"],
    });
    kb.resolveAllRelated();
    const concept = kb.getConcept("Zen Buddhism")!;
    expect(concept.related).toEqual([]);
    expect(concept.unresolvedRelated).toEqual(["Nie Angelegt"]);
  });
});
