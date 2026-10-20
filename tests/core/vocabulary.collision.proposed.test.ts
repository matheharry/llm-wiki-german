import { describe, it, expect } from "vitest";
import { KnowledgeBase } from "../../src/core/kb.js";
import { exportVocabulary } from "../../src/core/vocabulary.js";

/**
 * BEWEIS fuer den Namespace-Bug in exportVocabulary().
 *
 * Das Konzept-Budget wird als `maxItems - entities.length` berechnet.
 * Sobald es >= maxItems Entitaeten gibt, ist das Budget 0 — Konzepte
 * erscheinen dann NIE im Prompt, egal wie viele es gibt.
 *
 * Im Live-Wiki: 4.884 Entitaeten, 5.531 Konzepte, maxItems = 300
 * -> 300 Entitaeten, 0 Konzepte im Prompt.
 */
describe("exportVocabulary — Namespace-Budget", () => {
  it("zeigt Konzepte auch dann, wenn es >= maxItems Entitaeten gibt", () => {
    const kb = new KnowledgeBase();
    for (let i = 0; i < 10; i++) {
      kb.addEntity({ name: `Entity ${i}`, type: "person" });
    }
    kb.addConcept({ name: "Zen Buddhism", definition: "Eine philosophische Tradition." });

    const vocab = exportVocabulary(kb, 10);

    // Das ist der Kern des Bugs: 10 Entitaeten fillen das Budget komplett,
    // das Konzept wird nie ausgegeben.
    expect(vocab).toContain("Zen Buddhism");
  });

  it("teilt das Budget fair auf Entities und Concepts", () => {
    const kb = new KnowledgeBase();
    for (let i = 0; i < 100; i++) {
      kb.addEntity({ name: `Entity ${i}`, type: "person" });
    }
    for (let i = 0; i < 100; i++) {
      kb.addConcept({ name: `Konzept ${i}`, definition: `Definition ${i}.` });
    }

    const vocab = exportVocabulary(kb, 20);
    const entityLines = vocab.split("\n").filter((l) => l.startsWith("- ["));
    const conceptLines = vocab
      .split("\n")
      .filter((l) => l.startsWith("- ") && !l.startsWith("- ["));

    expect(entityLines.length).toBeGreaterThan(0);
    expect(conceptLines.length).toBeGreaterThan(0);
  });
});
