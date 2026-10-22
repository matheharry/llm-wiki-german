import type { KnowledgeBase } from "../core/kb.js";
import type { RankedItem } from "./types.js";
import { buildKbView, type KbView } from "./kb-view.js";
import { isExactNameHit } from "./exact-name.js";

const NAME_HIT = 3;
const FACT_HIT = 1;
const BIGRAM_BOOST = 6;
/**
 * Bonus fuer einen EXAKTEN Namenstreffer.
 *
 * Ohne das schlaegt ein laengerer Name den kuerzeren: bei der Frage
 * "Bleistift auf Finger" (1 Faktor) stand "Bleistift" (3 Fakten) vorn.
 *
 * Der Bonus wirkt auf den Keyword-Score, also auf die RRF-Position.
 * Das ist entscheidend: RRF komprimiert die Score-Differenzen — 25.6
 * gegen 10.5 werden zu 0.01311 gegen 0.01290, also zu 1.6 % Abstand.
 * Der Vorrang in `retrieve.ts` allein (2.4) kann den Qualitaets-
 * multiplikator (1.3) nicht ausgleichen; mit dem Keyword-Bonus
 * stimmt die RRF-Position schon.
 */
const EXACT_NAME_BOOST = 6;
function computeTermWeights(
  view: KbView,
  terms: readonly string[],
): Map<string, number> {
  const weights = new Map<string, number>();
  if (terms.length <= 1) {
    for (const t of terms) weights.set(t, 1.0);
    return weights;
  }

  const allEntities = view.entities;
  const allConcepts = view.concepts;
  const allSources = view.sources;
  const n = allEntities.length + allConcepts.length + allSources.length;
  if (n === 0) {
    for (const t of terms) weights.set(t, 1.0);
    return weights;
  }

  for (const t of terms) {
    let df = 0;
    for (const { nameLower, aliasesLower, factsLower } of allEntities) {
      if (
        nameLower.includes(t) ||
        aliasesLower.some((a) => a.includes(t)) ||
        factsLower.some((f) => f.includes(t))
      ) {
        df++;
      }
    }
    for (const { nameLower, definitionLower } of allConcepts) {
      if (nameLower.includes(t) || definitionLower.includes(t)) {
        df++;
      }
    }
    for (const { idLower, summaryLower } of allSources) {
      if (idLower.includes(t) || summaryLower.includes(t)) {
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
  view?: KbView,
  fullQuestion?: string,
): RankedItem[] {
  if (terms.length === 0) return [];
  const prepared = view ?? buildKbView(kb);
  const weights = computeTermWeights(prepared, terms);
  const items: Array<{ id: string; score: number; richness: number }> = [];

  for (const { entity, nameLower, aliasesLower, factsLower } of prepared.entities) {
    let score = 0;
    for (const t of terms) {
      const w = weights.get(t) ?? 1.0;
      if (nameLower.includes(t)) score += NAME_HIT * w;
      else if (aliasesLower.some((a) => a.includes(t))) score += NAME_HIT * w;
      for (const f of factsLower) {
        if (f.includes(t)) score += FACT_HIT * w;
      }
    }
    for (let i = 0; i < terms.length - 1; i++) {
      const bigram = `${terms[i]} ${terms[i + 1]}`;
      if (nameLower.includes(bigram)) score += BIGRAM_BOOST;
    }
    // Exakter Name — siehe `isExactNameHit`.
    if (isExactNameHit(nameLower, terms, fullQuestion)) score += EXACT_NAME_BOOST;
    if (score > 0) {
      items.push({
        id: entity.id,
        score,
        richness: entity.facts.length + entity.sources.length,
      });
    }
  }

  for (const { concept, nameLower, definitionLower } of prepared.concepts) {
    let score = 0;
    for (const t of terms) {
      const w = weights.get(t) ?? 1.0;
      if (nameLower.includes(t)) score += NAME_HIT * w;
      if (definitionLower.includes(t)) score += FACT_HIT * w;
    }
    // Exakter Name — siehe `isExactNameHit`.
    if (isExactNameHit(nameLower, terms, fullQuestion)) score += EXACT_NAME_BOOST;
    if (score > 0) {
      items.push({
        id: `concept:${concept.id}`,
        score,
        richness: (concept.related?.length ?? 0) + concept.sources.length,
      });
    }
  }

  for (const { source, idLower, summaryLower } of prepared.sources) {
    let score = 0;
    for (const t of terms) {
      const w = weights.get(t) ?? 1.0;
      if (idLower.includes(t)) score += NAME_HIT * w;
      if (summaryLower.includes(t)) score += FACT_HIT * w;
    }
    if (score > 0) {
      items.push({
        id: `source:${source.id}`,
        score,
        richness: 1,
      });
    }
  }

  items.sort((a, b) => b.score - a.score || b.richness - a.richness);
  return items.map(({ id, score }) => ({ id, score }));
}
