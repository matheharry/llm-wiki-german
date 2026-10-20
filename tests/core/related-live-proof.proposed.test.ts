/**
 * BEWEIS: die related-Auflösung gegen das echte Live-Wiki.
 *
 * Liest wiki/knowledge.json, baut den echten KnowledgeBase daraus, ruft
 * resolveAllRelated() auf und zaehlt, wie viele Verweise dadurch vom
 * toten Link zum lebenden Link werden.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { KnowledgeBase } from "../../src/core/kb.js";
import { makeId } from "../../src/core/ids.js";
import { isQualityEntity, isQualityConcept } from "../../src/core/filters.js";

const KB_PATH = "E:/Obsidian/obsidiannotes/wiki/knowledge.json";

interface RawKb {
  entities: Record<string, unknown>;
  concepts: Record<string, unknown>;
  sources: Record<string, unknown>;
  connections: unknown[];
}

describe("BEWEIS: related-Auflösung gegen das Live-Wiki", () => {
  it("wandelt tote Links in lebende Links um", () => {
    if (!existsSync(KB_PATH)) return;

    const raw = JSON.parse(readFileSync(KB_PATH, "utf-8")) as RawKb;
    const kb = new KnowledgeBase();
    // Die KB direkt befuellen (ohne Merge) — der Beweis prueft die
    // Aufloesung, nicht den Merge.
    kb.data.entities = raw.entities as never;
    kb.data.concepts = raw.concepts as never;
    kb.data.sources = raw.sources as never;
    kb.data.connections = raw.connections as never;

    // --- Zustand VOR der Auflösung ------------------------------------ //
    const pages = new Set<string>();
    for (const e of Object.values(kb.data.entities)) {
      if (isQualityEntity(e)) pages.add(e.id);
    }
    for (const c of Object.values(kb.data.concepts)) {
      if (isQualityConcept(c)) pages.add(c.id);
    }

    let totalBefore = 0;
    let deadBefore = 0;
    for (const concept of Object.values(kb.data.concepts)) {
      for (const r of concept.related ?? []) {
        if (typeof r !== "string" || !r.trim()) continue;
        totalBefore++;
        // So wurde der Link bisher gerendert: makeId(name).
        if (!pages.has(makeId(r))) deadBefore++;
      }
    }

    // --- Auflösung ---------------------------------------------------- //
    const stats = kb.resolveAllRelated();

    // --- Zustand NACH der Auflösung ----------------------------------- //
    let totalAfter = 0;
    let deadAfter = 0;
    for (const concept of Object.values(kb.data.concepts)) {
      for (const id of concept.related ?? []) {
        totalAfter++;
        if (!pages.has(id)) deadAfter++;
      }
    }

    // Erwartungen aus der Analyse:
    expect(totalBefore).toBeGreaterThan(10000);
    expect(deadBefore).toBeGreaterThan(2000);
    // Nach der Auflösung darf KEIN toter Link mehr übrig sein: aufgelöste
    // Verweise zeigen auf existierende IDs, unaufgelöste sind Klartext.
    expect(deadAfter).toBe(0);
    // Und die Verweise dürfen nicht verloren gehen.
    expect(totalAfter).toBe(stats.resolved);
    // Die Zahl der aufgelösten Verweise muss den geschätzten 8.400 entsprechen
    // (live gemessen: 8.400 aufgelöst, 2.738 ohne Ziel).
    expect(stats.resolved).toBeGreaterThan(8000);
    expect(stats.unresolved).toBeGreaterThan(2000);
  });
});
