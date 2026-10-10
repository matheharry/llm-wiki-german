import type { KnowledgeBase } from "../core/kb.js";
import type { RankedItem } from "./types.js";
import { buildKbView, type KbView } from "./kb-view.js";

export function rankByPath(
  kb: KnowledgeBase,
  terms: readonly string[],
  view?: KbView,
): RankedItem[] {
  if (terms.length === 0) return [];
  const prepared = view ?? buildKbView(kb);
  const items: RankedItem[] = [];

  const lowerPath = (path: string): string =>
    prepared.sourcePathLower.get(path) ?? path.toLowerCase();

  for (const { entity } of prepared.entities) {
    let score = 0;
    for (const src of entity.sources) {
      const lower = lowerPath(src);
      for (const t of terms) if (lower.includes(t)) score += 1;
    }
    if (score > 0) items.push({ id: entity.id, score });
  }

  for (const { concept } of prepared.concepts) {
    let score = 0;
    for (const src of concept.sources) {
      const lower = lowerPath(src);
      for (const t of terms) if (lower.includes(t)) score += 1;
    }
    if (score > 0) items.push({ id: `concept:${concept.id}`, score });
  }

  for (const { source, idLower } of prepared.sources) {
    let score = 0;
    for (const t of terms) if (idLower.includes(t)) score += 1;
    if (score > 0) items.push({ id: `source:${source.id}`, score });
  }

  items.sort((a, b) => b.score - a.score);
  return items;
}
