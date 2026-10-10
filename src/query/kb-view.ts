import type { KnowledgeBase } from "../core/kb.js";
import type { Concept, Entity, SourceRecord } from "../core/types.js";

/**
 * A per-query, allocation-once view of the knowledge base.
 *
 * `retrieve()` fans out to the keyword, path, and quality stages, and each of
 * them used to call `kb.allEntities()` / `allConcepts()` / `allSources()`
 * again — every call materializes a fresh array via `Object.values()` — and
 * re-ran `.toLowerCase()` over the same names, aliases, facts, and paths on
 * every query. On an 8 GB machine that redundant churn is exactly the kind of
 * GC pressure that makes search feel slow.
 *
 * Build one view per query and hand it to every stage.
 */
export interface EntityView {
  entity: Entity;
  nameLower: string;
  aliasesLower: string[];
  factsLower: string[];
}

export interface ConceptView {
  concept: Concept;
  nameLower: string;
  definitionLower: string;
}

export interface SourceView {
  source: SourceRecord;
  idLower: string;
  summaryLower: string;
}

export interface KbView {
  entities: EntityView[];
  concepts: ConceptView[];
  sources: SourceView[];
  entitiesById: Map<string, Entity>;
  conceptsById: Map<string, Concept>;
  sourcesById: Map<string, SourceRecord>;
  /** Lowercased source paths, shared across entities and concepts. */
  sourcePathLower: Map<string, string>;
}

export function buildKbView(kb: KnowledgeBase): KbView {
  const entitiesById = new Map<string, Entity>();
  const entities: EntityView[] = [];
  for (const e of kb.allEntities()) {
    entitiesById.set(e.id, e);
    entities.push({
      entity: e,
      nameLower: e.name.toLowerCase(),
      aliasesLower: e.aliases.map((a) => a.toLowerCase()),
      factsLower: e.facts.map((f) => f.toLowerCase()),
    });
  }

  const conceptsById = new Map<string, Concept>();
  const concepts: ConceptView[] = [];
  for (const c of kb.allConcepts()) {
    conceptsById.set(c.id, c);
    concepts.push({
      concept: c,
      nameLower: c.name.toLowerCase(),
      definitionLower: (c.definition ?? "").toLowerCase(),
    });
  }

  const sourcesById = new Map<string, SourceRecord>();
  const sources: SourceView[] = [];
  for (const s of kb.allSources()) {
    sourcesById.set(s.id, s);
    sources.push({
      source: s,
      idLower: s.id.toLowerCase(),
      summaryLower: (s.summary ?? "").toLowerCase(),
    });
  }

  // Source paths are referenced from entities and concepts; lowercase each
  // distinct path once so path ranking never re-lowercases the same string.
  const sourcePathLower = new Map<string, string>();
  const remember = (path: string): void => {
    if (!sourcePathLower.has(path)) sourcePathLower.set(path, path.toLowerCase());
  };
  for (const { entity } of entities) for (const p of entity.sources) remember(p);
  for (const { concept } of concepts) for (const p of concept.sources) remember(p);

  return {
    entities,
    concepts,
    sources,
    entitiesById,
    conceptsById,
    sourcesById,
    sourcePathLower,
  };
}
