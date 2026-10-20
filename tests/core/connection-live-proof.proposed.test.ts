/**
 * BEWEIS: der Verbindungsfilter gegen das echte Live-Wiki.
 *
 * Zählt die Verbindungs-Links, die auf Entity-Seiten entstehen, mit und
 * ohne Filter. Verwendet die ECHTE Filterlogik des Plugins
 * (isQualityEntity / isQualityConcept) — keine Nachbildung.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { KnowledgeBase } from "../../src/core/kb.js";
import { renderEntityPage } from "../../src/pages/render-entity.js";
import { isQualityEntity, isQualityConcept } from "../../src/core/filters.js";

const KB_PATH = "E:/Obsidian/obsidiannotes/wiki/knowledge.json";

describe("BEWEIS: Verbindungsfilter gegen das Live-Wiki", () => {
  it("erzeugt keine toten Links mehr in Entity-Seiten", () => {
    if (!existsSync(KB_PATH)) return;

    const raw = JSON.parse(readFileSync(KB_PATH, "utf-8")) as {
      entities: Record<string, never>;
      concepts: Record<string, never>;
      sources: Record<string, never>;
      connections: never[];
    };
    const kb = new KnowledgeBase();
    kb.data.entities = raw.entities;
    kb.data.concepts = raw.concepts;
    kb.data.sources = raw.sources;
    kb.data.connections = raw.connections;

    const pageIds = new Set<string>();
    for (const e of Object.values(kb.data.entities)) {
      if (isQualityEntity(e)) pageIds.add(e.id);
    }
    for (const c of Object.values(kb.data.concepts)) {
      if (isQualityConcept(c)) pageIds.add(c.id);
    }
    // Die Semantik des Generators: eine Verbindungs-ID zeigt auf eine
    // Entity- oder Konzept-Seite. Quellen sind kein Verbindungsziel.
    const hasPage = (id: string): boolean => pageIds.has(id);

    const nameById = new Map<string, string>();
    for (const e of Object.values(kb.data.entities)) nameById.set(e.id, e.name);
    for (const c of Object.values(kb.data.concepts)) nameById.set(c.id, c.name);

    let rendered = 0;
    let deadBefore = 0;
    let deadAfter = 0;
    let linksAfter = 0;
    let linksBefore = 0;

    for (const entity of Object.values(kb.data.entities)) {
      if (!isQualityEntity(entity)) continue;
      const connections = kb.connectionsFor(entity.id);
      rendered++;

      // VORHER: ohne Filter — jede Verbindung erzeugt einen Link.
      for (const c of connections) {
        const target = c.from === entity.id ? c.to : c.from;
        linksBefore++;
        if (!hasPage(target)) deadBefore++;
      }

      // NACHHER: mit Filter.
      const md = renderEntityPage(entity, connections, undefined, hasPage, nameById);
      const section = md.split("## Verbindungen\n")[1]?.split("##")[0] ?? "";
      for (const match of section.matchAll(/\[\[([^\]|]+)/g)) {
        linksAfter++;
        if (!hasPage(match[1])) deadAfter++;
      }
    }

    // Erwartungen (live gemessen):
    //   4.779 Entity-Seiten, 6.452 Verbindungs-Links, davon 296 tot.
    expect(rendered).toBeGreaterThan(4000);
    expect(linksBefore).toBeGreaterThan(6000);
    // - vor dem Filter gab es tote Links
    expect(deadBefore).toBeGreaterThan(0);
    expect(deadBefore).toBeLessThan(linksBefore);
    // - nach dem Filter: kein toter Link mehr
    expect(deadAfter).toBe(0);
    // - und genau die toten Links wurden entfernt, die lebenden blieben
    expect(linksAfter).toBe(linksBefore - deadBefore);
    expect(linksAfter).toBeGreaterThan(6000);
  });
});
