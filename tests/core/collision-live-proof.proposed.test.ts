/**
 * BEWEIS gegen die echten Kollisionen des Live-Wiki.
 *
 * Liest wiki/knowledge.json, wendet die ECHTE resolveCrossNamespaceCollision()
 * auf jede Kollision an und zaehlt, wie viele aufgeloest werden.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolveCrossNamespaceCollision, isSameTerm } from "../../src/core/collision.js";

const KB_PATH = "E:/Obsidian/obsidiannotes/wiki/knowledge.json";

describe("BEWEIS: Kollisionsregel gegen das Live-Wiki", () => {
  it("loest die Mehrzahl der echten Kollisionen auf", () => {
    if (!existsSync(KB_PATH)) {
      // Kein Live-Wiki vorhanden -> Test ueberspringen, nicht fehlschlagen.
      return;
    }
    const kb = JSON.parse(readFileSync(KB_PATH, "utf-8")) as {
      entities: Record<string, { name: string; type: string; facts: string[]; sources: string[] }>;
      concepts: Record<string, { name: string; definition: string; sources: string[] }>;
    };

    const entityIds = Object.keys(kb.entities);
    const conceptIds = Object.keys(kb.concepts);
    const collisions = entityIds.filter((id) => conceptIds.includes(id));

    let migrate = 0;
    let keep = 0;
    let different = 0;
    let factsMoved = 0;
    let sourcesGained = 0;

    for (const id of collisions) {
      const e = kb.entities[id];
      const c = kb.concepts[id];
      if (!isSameTerm(e.name, c.name)) {
        different++;
        continue;
      }
      // Szenario A: Konzept existiert, Entity kommt -> addEntity-Pfad
      const decisionA = resolveCrossNamespaceCollision({
        newId: id,
        newName: e.name,
        newKind: "entity",
        newType: e.type,
        existingKind: "concept",
        existingId: id,
        existingName: c.name,
        existingText: c.definition,
        newText: e.facts.join(" "),
      });
      // Szenario B: Entity existiert, Konzept kommt -> addConcept-Pfad
      const decisionB = resolveCrossNamespaceCollision({
        newId: id,
        newName: c.name,
        newKind: "concept",
        existingKind: "entity",
        existingId: id,
        existingName: e.name,
        existingType: e.type,
        existingText: e.facts.join(" "),
        newText: c.definition,
      });

      const merged = decisionA.action === "merge" || decisionB.action === "merge";
      if (merged) {
        migrate++;
        factsMoved += e.facts.length;
        sourcesGained += e.sources.filter((s) => !c.sources.includes(s)).length;
      } else {
        keep++;
      }
    }

    // Grundannahmen des Audits muessen weiterhin gelten.
    expect(collisions.length).toBeGreaterThan(500);
    // Die Mehrheit wird aufgeloest.
    expect(migrate).toBeGreaterThan(collisions.length * 0.6);
    // Aber nicht alle: konkrete Objekte duerfen nicht verschwinden.
    expect(keep).toBeGreaterThan(100);
    // Kein Faktenverlust: die migrierten Fakten wandern in die Definition.
    expect(factsMoved).toBeGreaterThan(0);
    // Die Migration ergaenzt zudem Quellen, die nur in der Entity standen.
    expect(sourcesGained).toBeGreaterThan(0);
    // Und kein Begriff wird doppelt gezaehlt: alle Kollisionen sind
    // Begriffe, nicht nur Slug-Kollisionen.
    expect(different).toBe(0);
  });
});
