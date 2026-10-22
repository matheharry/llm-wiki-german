/**
 * BEWEIS: die related-Aufloesung gegen das echte Live-Wiki.
 *
 * Liest wiki/knowledge.json, baut den echten KnowledgeBase daraus, ruft
 * resolveAllRelated() auf und zaehlt, wie viele Verweise dadurch vom
 * toten Link zum lebenden Link werden.
 *
 * WICHTIG — Zustandsabhaengigkeit:
 * Der Test prueft den Zustand der LIVE-KB. Diese KB wurde bereits
 * migriert: `related` enthaelt jetzt schon aufgeloeste IDs und einen
 * eigenen `unresolvedRelated`-Eintrag fuer Namen ohne Ziel. Die frueher
 * hier geprueften Vor-Migrations-Werte ("mehr als 10.000 Verweise, davon
 * mehr als 2.000 tot") gelten nur fuer eine un-migrierte KB und sind
 * nach der Migration nicht mehr reproduzierbar — der Test schlaeg dann
 * fehl, obwohl das Plugin korrekt arbeitet.
 *
 * Deshalb prueft der Test heute invarianten statt Momentaufnahmen:
 *   1. Es gibt KEINE toten Links mehr (jeder Verweis zeigt auf eine Seite).
 *   2. Die Zahl der aufgeloesten Verweise passt zur KB.
 *   3. Die Aufloesung ist idempotent (zweiter Lauf aendert nichts).
 *   4. Namen ohne Ziel stehen in `unresolvedRelated` und werden beim
 *      Rendern als Klartext gefuehrt, nicht verlinkt.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { KnowledgeBase } from "../../src/core/kb.js";
import { makeId } from "../../src/core/ids.js";
import { isQualityEntity, isQualityConcept } from "../../src/core/filters.js";
import { renderConceptPage } from "../../src/pages/render-concept.js";

const KB_PATH = "E:/Obsidian/obsidiannotes/wiki/knowledge.json";

interface RawKb {
  entities: Record<string, unknown>;
  concepts: Record<string, unknown>;
  sources: Record<string, unknown>;
  connections: unknown[];
}

function loadLiveKb(): KnowledgeBase | null {
  if (!existsSync(KB_PATH)) return null;
  const raw = JSON.parse(readFileSync(KB_PATH, "utf-8")) as RawKb;
  const kb = new KnowledgeBase();
  // Die KB direkt befuellen (ohne Merge) — der Beweis prueft die
  // Aufloesung, nicht den Merge.
  kb.data.entities = raw.entities as never;
  kb.data.concepts = raw.concepts as never;
  kb.data.sources = raw.sources as never;
  kb.data.connections = raw.connections as never;
  return kb;
}

/** IDs, fuer die tatsaechlich eine Seite geschrieben wird. */
function pageIds(kb: KnowledgeBase): Set<string> {
  const pages = new Set<string>();
  for (const e of Object.values(kb.data.entities)) {
    if (isQualityEntity(e)) pages.add(e.id);
  }
  for (const c of Object.values(kb.data.concepts)) {
    if (isQualityConcept(c)) pages.add(c.id);
  }
  return pages;
}

describe("BEWEIS: related-Aufloesung gegen das Live-Wiki", () => {
  it("laesst keinen toten Link uebrig", () => {
    const kb = loadLiveKb();
    if (!kb) return;

    const pages = pageIds(kb);

    let totalBefore = 0;
    let deadBefore = 0;
    for (const concept of Object.values(kb.data.concepts)) {
      for (const r of concept.related ?? []) {
        if (typeof r !== "string" || !r.trim()) continue;
        totalBefore++;
        // So wurde der Link im ZUSTAND VOR der Aufloesung gerendert:
        // makeId(name). Nach der Migration sind die Verweise bereits IDs.
        if (!pages.has(makeId(r))) deadBefore++;
      }
    }

    // --- Aufloesung ---------------------------------------------------- //
    const stats = kb.resolveAllRelated();

    // --- Zustand NACH der Aufloesung ----------------------------------- //
    let totalAfter = 0;
    let deadAfter = 0;
    for (const concept of Object.values(kb.data.concepts)) {
      for (const id of concept.related ?? []) {
        totalAfter++;
        if (!pages.has(id)) deadAfter++;
      }
    }

    // INVARIANTE 1: Kein toter Link darf uebrig bleiben. Aufgeloeste
    // Verweise zeigen auf existierende IDs, unaufgelöste sind Klartext.
    expect(deadAfter).toBe(0);

    // INVARIANTE 1b: Die Aufloesung erzeugt nie mehr tote Links als
    // vorher. Das gilt auch fuer eine noch nicht migrierte KB.
    expect(deadAfter).toBeLessThanOrEqual(deadBefore);

    // INVARIANTE 2: Die Zahl der aufgeloesten Verweise passt zur KB.
    expect(totalAfter).toBe(stats.resolved);

    // INVARIANTE 3: Es gibt ueberhaupt related-Verweise zu pruefen.
    // (Sonst waere der Test ein No-Op.)
    expect(totalAfter).toBeGreaterThan(0);
    expect(totalBefore).toBeGreaterThan(0);
  });

  it("ist idempotent — ein zweiter Aufloesungslauf aendert nichts", () => {
    const kb = loadLiveKb();
    if (!kb) return;

    const first = kb.resolveAllRelated();
    const snapshot = JSON.stringify(kb.data.concepts);

    const second = kb.resolveAllRelated();
    const after = JSON.stringify(kb.data.concepts);

    expect(second.resolved).toBe(first.resolved);
    expect(second.unresolved).toBe(first.unresolved);
    expect(after).toBe(snapshot);
  });

  it("rendert unaufgeloeste Verweise als Klartext, nicht als Link", () => {
    const kb = loadLiveKb();
    if (!kb) return;

    kb.resolveAllRelated();

    // Mindestens ein Konzept muss unaufgeloeste Verweise fuehren,
    // sonst waere der Test ein No-Op.
    const withUnresolved = Object.values(kb.data.concepts).filter(
      (c) => (c.unresolvedRelated ?? []).length > 0,
    );
    expect(withUnresolved.length).toBeGreaterThan(0);

    for (const concept of withUnresolved.slice(0, 50)) {
      const page = renderConceptPage(concept, undefined, undefined);
      // Kein unaufgeloester Name darf als Wikilink gerendert werden.
      for (const name of concept.unresolvedRelated ?? []) {
        const label = name.replace(/[[\]]/g, "");
        expect(page).not.toContain(`[[${label}]]`);
      }
      // ... und muss stattdessen als Klartext auftauchen.
      expect(page).toContain("## Verwandte Begriffe (ohne Eintrag)");
    }
  });
});
