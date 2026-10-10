import type { KnowledgeBase } from "../core/kb.js";
import type { RankedItem } from "./types.js";

const NAME_HIT = 3;
const FACT_HIT = 1;
const BIGRAM_BOOST = 6;

function computeTermWeights(
  kb: KnowledgeBase,
  terms: readonly string[],
): Map<string, number> {
  const weights = new Map<string, number>();
  if (terms.length <= 1) {
    for (const t of terms) weights.set(t, 1.0);
    return weights;
  }

  const allEntities = kb.allEntities();
  const allConcepts = kb.allConcepts();
  const allSources = kb.allSources();
  const n = allEntities.length + allConcepts.length + allSources.length;
  if (n === 0) {
    for (const t of terms) weights.set(t, 1.0);
    return weights;
  }

  for (const t of terms) {
    let df = 0;
    for (const e of allEntities) {
      if (
        e.name.toLowerCase().includes(t) ||
        e.aliases.some((a) => a.toLowerCase().includes(t)) ||
        e.facts.some((f) => f.toLowerCase().includes(t))
      ) {
        df++;
      }
    }
    for (const c of allConcepts) {
      if (
        c.name.toLowerCase().includes(t) ||
        (c.definition && c.definition.toLowerCase().includes(t))
      ) {
        df++;
      }
    }
    for (const s of allSources) {
      if (
        s.id.toLowerCase().includes(t) ||
        (s.summary && s.summary.toLowerCase().includes(t))
      ) {
        df++;
      }
    }
    // Smoothed IDF: terms specific to fewer items receive higher weight
    const idf = 1 + Math.log(1 + n / (df + 1));
    weights.set(t, idf);
  }
  return weights;
}

export function rankByKeyword(
  kb: KnowledgeBase,
  terms: readonly string[],
): RankedItem[] {
  if (terms.length === 0) return [];
  const weights = computeTermWeights(kb, terms);
  const items: Array<{ id: string; score: number; richness: number }> = [];

  for (const e of kb.allEntities()) {
    let score = 0;
    const nameLower = e.name.toLowerCase();
    const aliasesLower = e.aliases.map((a) => a.toLowerCase());
    for (const t of terms) {
      const w = weights.get(t) ?? 1.0;
      if (nameLower.includes(t)) score += NAME_HIT * w;
      else if (aliasesLower.some((a) => a.includes(t))) score += NAME_HIT * w;
      for (const f of e.facts) {
        if (f.toLowerCase().includes(t)) score += FACT_HIT * w;
      }
    }
    for (let i = 0; i < terms.length - 1; i++) {
      const bigram = `${terms[i]} ${terms[i + 1]}`;
      if (nameLower.includes(bigram)) score += BIGRAM_BOOST;
    }
    if (score > 0) {
      items.push({
        id: e.id,
        score,
        richness: e.facts.length + e.sources.length,
      });
    }
  }

  for (const c of kb.allConcepts()) {
    let score = 0;
    const nameLower = c.name.toLowerCase();
    const defLower = (c.definition ?? "").toLowerCase();
    for (const t of terms) {
      const w = weights.get(t) ?? 1.0;
      if (nameLower.includes(t)) score += NAME_HIT * w;
      if (defLower.includes(t)) score += FACT_HIT * w;
    }
    if (score > 0) {
      items.push({
        id: `concept:${c.id}`,
        score,
        richness: (c.related?.length ?? 0) + c.sources.length,
      });
    }
  }

  for (const s of kb.allSources()) {
    let score = 0;
    const idLower = s.id.toLowerCase();
    const summaryLower = (s.summary ?? "").toLowerCase();
    for (const t of terms) {
      const w = weights.get(t) ?? 1.0;
      if (idLower.includes(t)) score += NAME_HIT * w;
      if (summaryLower.includes(t)) score += FACT_HIT * w;
    }
    if (score > 0) {
      items.push({
        id: `source:${s.id}`,
        score,
        richness: 1,
      });
    }
  }

  items.sort((a, b) => b.score - a.score || b.richness - a.richness);
  return items.map(({ id, score }) => ({ id, score }));
}

