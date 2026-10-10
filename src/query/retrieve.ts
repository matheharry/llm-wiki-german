import type { Concept, Entity, SourceRecord } from "../core/types.js";
import type { QueryType, RankedItem, RetrievedBundle } from "./types.js";
import {
  RETRIEVAL_CONCEPT_BLACKLIST,
  RETRIEVAL_ENTITY_BLACKLIST,
  createQualityMultiplier,
  detectTypeHint,
} from "./quality.js";

import type { KnowledgeBase } from "../core/kb.js";
import { classifyQuery } from "./classify.js";
import { extractQueryTerms } from "./terms.js";
import { filterBundleByFolder } from "./folder-scope.js";
import { rankByEmbedding } from "./embedding-ranker.js";
import { rankByKeyword } from "./keyword-ranker.js";
import { rankByPath } from "./path-ranker.js";
import { rrfFuse } from "./rrf.js";
import { buildKbView } from "./kb-view.js";

const QUERY_WEIGHTS: Record<QueryType, [number, number, number]> = {
  entity_lookup: [2.0, 0.5, 0.3],
  list_category: [0.8, 0.8, 1.5],
  relational: [1.0, 1.2, 0.5],
  conceptual: [0.8, 1.5, 0.5],
};

const TYPE_HINT_BOOST = 2.5;
const RRF_K = 60;
const MAX_ENTITIES = 8;
const MAX_CONCEPTS = 5;
const MAX_CONNECTIONS = 20;

export interface RetrieveArgs {
  question: string;
  kb: KnowledgeBase;
  embeddingIndex?: ReadonlyMap<string, number[]>;
  /** Precomputed L2 norms for the indexed vectors, keyed by id. */
  embeddingNorms?: ReadonlyMap<string, number>;
  queryEmbedding?: number[] | null;
  folders?: string[];
}

export function retrieve(args: RetrieveArgs): RetrievedBundle {
  const terms = extractQueryTerms(args.question);
  const queryType = classifyQuery(args.question);
  const [wKeyword, wEmbed, wPath] = QUERY_WEIGHTS[queryType];

  // One prepared view per query: materializes the three record arrays once and
  // precomputes lowercased fields, so no stage re-scans the KB or re-lowercases
  // the same strings. The id maps it exposes also drive O(1) quality scoring.
  const view = buildKbView(args.kb);
  const { entitiesById, conceptsById, sourcesById } = view;

  const kwRanked = rankByKeyword(args.kb, terms, view);
  const pathRanked = rankByPath(args.kb, terms, view);
  const embedRanked: RankedItem[] =
    args.embeddingIndex && args.queryEmbedding
      ? rankByEmbedding(args.embeddingIndex, args.queryEmbedding, undefined, args.embeddingNorms)
      : [];

  const fused = rrfFuse(
    [kwRanked, embedRanked, pathRanked],
    [wKeyword, wEmbed, wPath],
    RRF_K,
  );

  const typeHint = detectTypeHint(terms);

  // Source-keyed reverse indices for O(1) entity/concept expansion.
  const entitiesBySource = new Map<string, Entity[]>();
  for (const { entity } of view.entities) {
    for (const src of entity.sources) {
      let list = entitiesBySource.get(src);
      if (!list) {
        list = [];
        entitiesBySource.set(src, list);
      }
      list.push(entity);
    }
  }

  const conceptsBySource = new Map<string, Concept[]>();
  for (const { concept } of view.concepts) {
    for (const src of concept.sources) {
      let list = conceptsBySource.get(src);
      if (!list) {
        list = [];
        conceptsBySource.set(src, list);
      }
      list.push(concept);
    }
  }

  // Score by id with O(1) lookups — no per-item linear scan of the KB.
  const qualityOf = createQualityMultiplier({
    entities: entitiesById,
    concepts: conceptsById,
    sources: sourcesById,
  });

  // Apply quality multipliers and type-hint boost
  const adjusted = fused
    .map((item) => {
      let score = item.score * qualityOf(item.id);
      if (typeHint && !item.id.startsWith("concept:") && !item.id.startsWith("source:")) {
        const ent = entitiesById.get(item.id);
        if (ent && ent.type === typeHint) score *= TYPE_HINT_BOOST;
      }
      return { id: item.id, score };
    })
    .sort((a, b) => b.score - a.score);

  // Resolve to entities, concepts, and direct sources, filtering blacklist
  const entities: RetrievedBundle["entities"] = [];
  const concepts: RetrievedBundle["concepts"] = [];
  const directSources: SourceRecord[] = [];
  const seenEntities = new Set<string>();
  const seenConcepts = new Set<string>();
  const seenSources = new Set<string>();

  for (const item of adjusted) {
    if (item.id.startsWith("source:")) {
      const sourceId = item.id.slice("source:".length);
      const s = sourcesById.get(sourceId);
      if (!s || seenSources.has(s.id)) continue;
      seenSources.add(s.id);
      directSources.push(s);

      // Fast O(1) retrieval of entities and concepts that reference this source
      const matchingEntities = entitiesBySource.get(s.id) ?? [];
      for (const e of matchingEntities) {
        if (!seenEntities.has(e.id) && entities.length < MAX_ENTITIES) {
          seenEntities.add(e.id);
          entities.push(e);
        }
      }
      const matchingConcepts = conceptsBySource.get(s.id) ?? [];
      for (const c of matchingConcepts) {
        if (!seenConcepts.has(c.id) && concepts.length < MAX_CONCEPTS) {
          seenConcepts.add(c.id);
          concepts.push(c);
        }
      }
    } else if (item.id.startsWith("concept:")) {
      if (concepts.length >= MAX_CONCEPTS) continue;
      const conceptId = item.id.slice("concept:".length);
      const c = conceptsById.get(conceptId);
      if (!c || seenConcepts.has(c.id)) continue;
      if (
        RETRIEVAL_CONCEPT_BLACKLIST.has(conceptId) ||
        RETRIEVAL_CONCEPT_BLACKLIST.has(c.name.toLowerCase())
      ) {
        continue;
      }
      seenConcepts.add(c.id);
      concepts.push(c);
    } else {
      if (entities.length >= MAX_ENTITIES) continue;
      const e = entitiesById.get(item.id);
      if (!e || seenEntities.has(e.id)) continue;
      if (
        RETRIEVAL_ENTITY_BLACKLIST.has(item.id) ||
        RETRIEVAL_ENTITY_BLACKLIST.has(e.name.toLowerCase())
      ) {
        continue;
      }
      seenEntities.add(e.id);
      entities.push(e);
    }
  }

  // Gather connections that touch retrieved items, prioritizing most relevant ones
  const entityIds = new Set(entities.map((e) => e.id));
  const conceptIds = new Set(concepts.map((c) => c.id));
  const retrievedNodeIds = new Set([...entityIds, ...conceptIds]);

  const candidateConnections = args.kb
    .allConnections()
    .filter((c) => entityIds.has(c.from) || entityIds.has(c.to));

  // Score connections: both ends retrieved > query term match > single end
  const scoredConnections = candidateConnections.map((c) => {
    let prio = 0;
    const bothRetrieved =
      retrievedNodeIds.has(c.from) && retrievedNodeIds.has(c.to);
    if (bothRetrieved) prio += 10;
    const descLower = (c.description ?? "").toLowerCase();
    const typeLower = (c.type ?? "").toLowerCase();
    for (const t of terms) {
      if (descLower.includes(t) || typeLower.includes(t)) prio += 3;
    }
    return { connection: c, prio };
  });

  scoredConnections.sort((a, b) => b.prio - a.prio);
  const connections = scoredConnections
    .slice(0, MAX_CONNECTIONS)
    .map((sc) => sc.connection);

  // Gather source records referenced by surviving entities/concepts + direct sources
  const sourcePaths = new Set<string>(directSources.map((s) => s.id));
  for (const e of entities) for (const s of e.sources) sourcePaths.add(s);
  for (const c of concepts) for (const s of c.sources) sourcePaths.add(s);
  const sources: SourceRecord[] = [];
  for (const id of sourcePaths) {
    const s = sourcesById.get(id);
    if (s) sources.push(s);
  }


  const bundle: RetrievedBundle = {
    question: args.question,
    queryType,
    entities,
    concepts,
    connections,
    sources,
  };

  return filterBundleByFolder(bundle, args.folders ?? []);
}
