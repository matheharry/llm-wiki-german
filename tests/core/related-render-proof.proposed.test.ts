/**
 * BEWEIS: gerenderte Konzeptseiten mit echten Daten.
 *
 * Zeigt, wie eine Seite nach der Auflösung aussieht: lebende Links mit
 * Anzeigename, und die nicht auflösbaren Begriffe als Klartext.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { KnowledgeBase } from "../../src/core/kb.js";
import { renderConceptPage } from "../../src/pages/render-concept.js";
import { isQualityEntity, isQualityConcept } from "../../src/core/filters.js";

const KB_PATH = "E:/Obsidian/obsidiannotes/wiki/knowledge.json";

describe("BEWEIS: gerenderte Konzeptseite", () => {
  it("zeigt lebende Links und Klartext fuer unaufgeloeste Begriffe", () => {
    if (!existsSync(KB_PATH)) return;

    const raw = JSON.parse(readFileSync(KB_PATH, "utf-8")) as {
      entities: Record<string, never>;
      concepts: Record<string, never>;
    };
    const kb = new KnowledgeBase();
    kb.data.entities = raw.entities;
    kb.data.concepts = raw.concepts;

    kb.resolveAllRelated();

    const nameById = new Map<string, string>();
    for (const e of Object.values(kb.data.entities)) nameById.set(e.id, e.name);
    for (const c of Object.values(kb.data.concepts)) nameById.set(c.id, c.name);

    // Ein Konzept mit beiden Arten von Verweisen finden.
    const sample = Object.values(kb.data.concepts).find(
      (c) =>
        isQualityConcept(c) &&
        c.related.length > 0 &&
        (c.unresolvedRelated?.length ?? 0) > 0,
    );
    if (!sample) return;

    const md = renderConceptPage(sample, undefined, nameById);

    // Jeder aufgeloeste Verweis ist ein lebender Link mit Anzeigename.
    for (const id of sample.related) {
      const label = nameById.get(id);
      expect(label, `kein Anzeigename fuer ${id}`).toBeDefined();
      expect(md).toContain(`[[${id}|${label}]]`);
    }
    // Kein toter Link: jeder Link im "Verwandte Begriffe"-Abschnitt
    // verweist auf eine existierende Seite.
    const linkSection = md.split("## Verwandte Begriffe\n")[1]?.split("##")[0] ?? "";
    for (const match of linkSection.matchAll(/\[\[([^\]|]+)/g)) {
      const target = match[1];
      const entity = kb.data.entities[target as never];
      const concept = kb.data.concepts[target as never];
      const exists =
        (entity !== undefined && isQualityEntity(entity)) ||
        (concept !== undefined && isQualityConcept(concept));
      expect(exists, `toter Link: ${target}`).toBe(true);
    }
    // Unaufgeloeste Begriffe stehen als Klartext da, ohne Link.
    expect(md).toContain("## Verwandte Begriffe (ohne Eintrag)");
    for (const u of sample.unresolvedRelated ?? []) {
      expect(md).toContain(`- ${u}`);
    }
  });
});
