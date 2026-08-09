import type { KnowledgeBase } from "../core/kb.js";
import { isQualityEntity, isQualityConcept } from "../core/filters.js";
import { renderEntityPage } from "./render-entity.js";
import { renderConceptPage } from "./render-concept.js";
import { renderSourcePage } from "./render-source.js";
import { renderIndexPage } from "./render-index.js";
import {
  safeWritePage,
  safeDeletePage,
  listPagePaths,
  type SafeWriteApp,
} from "../vault/safe-write.js";

export interface FilteredItem {
  kind: "entity" | "concept";
  name: string;
  id: string;
  reason: string;
}

export interface GenerateResult {
  written: number;
  deleted: number;
  /** Items excluded by the quality filter — useful for logging/debugging. */
  filtered: FilteredItem[];
}

export async function generatePages(
  app: SafeWriteApp,
  kb: KnowledgeBase,
): Promise<GenerateResult> {
  const written = new Set<string>();
  const filtered: FilteredItem[] = [];

  // Index page
  const indexPath = "wiki/index.md";
  await safeWritePage(app, indexPath, renderIndexPage(kb));
  written.add(indexPath);

  // Entities — only quality items get pages
  for (const entity of kb.allEntities()) {
    if (!isQualityEntity(entity)) {
      filtered.push({
        kind: "entity",
        name: entity.name,
        id: entity.id,
        reason: describeEntityFilterReason(entity),
      });
      continue;
    }
    const path = `wiki/entities/${entity.id}.md`;
    const connections = kb.connectionsFor(entity.id);
    await safeWritePage(app, path, renderEntityPage(entity, connections));
    written.add(path);
  }

  // Concepts — only quality items get pages
  for (const concept of kb.allConcepts()) {
    if (!isQualityConcept(concept)) {
      filtered.push({
        kind: "concept",
        name: concept.name,
        id: concept.id,
        reason: describeConceptFilterReason(concept),
      });
      continue;
    }
    const path = `wiki/concepts/${concept.id}.md`;
    await safeWritePage(app, path, renderConceptPage(concept));
    written.add(path);
  }

  // Sources — every source gets a page (no quality filter for sources)
  for (const source of kb.allSources()) {
    const path = sourcePagePath(source.id);
    const relatedEntities = kb
      .allEntities()
      .filter((e) => e.sources.includes(source.id));
    const relatedConcepts = kb
      .allConcepts()
      .filter((c) => c.sources.includes(source.id));
    await safeWritePage(
      app,
      path,
      renderSourcePage(source, relatedEntities, relatedConcepts),
    );
    written.add(path);
  }

  // Prune stale pages
  const existing = [
    ...(await listPagePaths(app, "wiki/entities/")),
    ...(await listPagePaths(app, "wiki/concepts/")),
    ...(await listPagePaths(app, "wiki/sources/")),
  ];
  let deleted = 0;
  for (const existingPath of existing) {
    if (!written.has(existingPath)) {
      await safeDeletePage(app, existingPath);
      deleted++;
    }
  }

  return { written: written.size, deleted, filtered };
}

export function sourcePagePath(sourcePath: string): string {
  return `wiki/sources/${sourcePath}`;
}

// ---------------------------------------------------------------------------
// Internal helpers — describe why a KB item was excluded by the quality filter
// ---------------------------------------------------------------------------

import type { Entity, Concept } from "../core/types.js";
import { ENTITY_BLACKLIST, CONCEPT_BLACKLIST, isFileNameOrPathLike } from "../core/filters.js";

function describeEntityFilterReason(e: Entity): string {
  const lower = e.name.trim().toLowerCase();
  if (ENTITY_BLACKLIST.has(lower)) return `Name auf Blacklist ("${e.name}")`;
  if (isFileNameOrPathLike(e.name)) return `Dateiname oder Pfad anstelle einer Entität ("${e.name}")`;
  if (e.facts.length === 0 && e.aliases.length === 0)
    return "Keine Fakten und keine Aliasse";
  if (e.facts.length < 1) return `Zu wenige Fakten (${e.facts.length})`;
  if (e.sources.length < 1) return `Zu wenige Quellen (${e.sources.length})`;
  return "Qualitätsprüfung nicht bestanden";
}

function describeConceptFilterReason(c: Concept): string {
  const lower = c.name.trim().toLowerCase();
  if (CONCEPT_BLACKLIST.has(lower)) return `Name auf Blacklist ("${c.name}")`;
  if (isFileNameOrPathLike(c.name)) return `Dateiname oder Pfad anstelle eines Konzepts ("${c.name}")`;
  if (!c.definition || c.definition.trim().length === 0)
    return "Keine Definition vorhanden";
  return "Qualitätsprüfung nicht bestanden";
}
