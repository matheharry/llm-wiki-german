import type { Concept, Entity, SourceRecord } from "../core/types.js";
import type { QueryType, RankedItem, RetrievedBundle } from "./types.js";
import {
  RETRIEVAL_CONCEPT_BLACKLIST,
  RETRIEVAL_ENTITY_BLACKLIST,
  createQualityMultiplier,
  detectTypeHint,
} from "./quality.js";

import type { KnowledgeBase } from "../core/kb.js";
import { isRetrievableEntity } from "../core/filters.js";
import { classifyQuery } from "./classify.js";
import { extractQueryTerms } from "./terms.js";
import { filterBundleByFolder } from "./folder-scope.js";
import { rankByEmbedding } from "./embedding-ranker.js";
import { rankByKeyword } from "./keyword-ranker.js";
import { matchesQuestion } from "./exact-name.js";
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
/**
 * Vorrang fuer einen exakten Namenstreffer.
 *
 * Der Qualitaetsmultiplikator belohnt Faktenmenge und Quellenzahl und
 * kann dadurch die Relevanz ueberstimmen: bei der Frage "Meteor"
 * schlug "Meteorologie" (3 Fakten, Multiplikator 1.3) das gesuchte
 * "Meteor" (1 Faktor, Multiplikator 1.0). Der Exakt-Treffer wird
 * deshalb nach der Qualitaetsanrechnung wieder nach vorn geholt.
 *
 * Der Vorrang gilt fuer den Fall, in dem die Frage EXAKT der Name
 * ist: die Frage "Meteor" meint die Entity "Meteor" — nicht
 * "Meteorologie" (3 Fakten, Qualitaetsmultiplikator 1.3) und nicht
 * "Meteorologische Jahreszeiten".
 *
 * Eine zweite Stufe ("ein Suchbegriff IST der Name") wurde gemessen
 * und wieder entfernt: sie brachte in der Live-KB keinen Unterschied
 * (19 von 19 erreichbar mit und ohne). Der Keyword-Bonus in
 * `keyword-ranker.ts` deckt den Mehrwort-Fall bereits ab.
 *
 * Der Wert muss staerker sein als der Qualitaetsmultiplikator, der
 * spaeter auf denselben Score wirkt (max. 1.3). 2.4 liegt darueber.
 */
const EXACT_MATCH_PRIORITY = 2.4;

/**
 * Obergrenzen fuer das Bundle.
 *
 * Frueher hart codiert. Jetzt ueber `RetrieveArgs.limits` setzbar, damit
 * der Benutzer die Tiefe der Antwort anpassen kann, ohne den Code zu
 * aendern — die Werte entscheiden direkt darueber, wie viel Kontext
 * ans LLM geht.
 */
export const DEFAULT_RETRIEVAL_LIMITS = {
  maxEntities: 8,
  maxConcepts: 5,
  maxConnections: 20,
  maxSources: 30,
} as const;

export interface RetrievalLimits {
  maxEntities: number;
  maxConcepts: number;
  maxConnections: number;
  /**
   * Obergrenze fuer die Quellenliste im Bundle.
   *
   * Vorher gab es keine: es wurden alle Quellen der gefundenen Items
   * PLUS aller direkt getroffenen Source-Records mitgegeben. Bei einer
   * Frage nach "Werkzeuge von Harald March" waren das 659 Quellen und
   * 377 kB Kontext — davon 469 Quellen, die nur durch einen
   * Summary-Match getroffen wurden und nie eine Fundstelle belegten.
   */
  maxSources: number;
}

export interface RetrieveArgs {
  question: string;
  kb: KnowledgeBase;
  embeddingIndex?: ReadonlyMap<string, number[]>;
  /** Precomputed L2 norms for the indexed vectors, keyed by id. */
  embeddingNorms?: ReadonlyMap<string, number>;
  queryEmbedding?: number[] | null;
  folders?: string[];
  /** Ueberschreibt die Standardobergrenzen. */
  limits?: Partial<RetrievalLimits>;
  /**
   * Namen fuer die Anzeige im Kontext (IDs -> lesbare Namen).
   *
   * Ohne diese Mappe erscheinen `related`-Verweise und Verbindungen im
   * Prompt als Slugs ("schulmaterial") statt als Namen
   * ("Schulmaterial"). Das LLM kann mit einem Slug nichts anfangen.
   */
  nameById?: ReadonlyMap<string, string>;
}

export function retrieve(args: RetrieveArgs): RetrievedBundle {
  const terms = extractQueryTerms(args.question);
  const queryType = classifyQuery(args.question);
  const [wKeyword, wEmbed, wPath] = QUERY_WEIGHTS[queryType];
  const limits: RetrievalLimits = {
    ...DEFAULT_RETRIEVAL_LIMITS,
    ...args.limits,
  };
  const maxEntities = Math.max(0, limits.maxEntities);
  const maxConcepts = Math.max(0, limits.maxConcepts);
  const maxConnections = Math.max(0, limits.maxConnections);
  const maxSources = Math.max(0, limits.maxSources);

  // One prepared view per query: materializes the three record arrays once and
  // precomputes lowercased fields, so no stage re-scans the KB or re-lowercases
  // the same strings. The id maps it exposes also drive O(1) quality scoring.
  const view = buildKbView(args.kb);
  const { entitiesById, conceptsById, sourcesById } = view;

  const kwRanked = rankByKeyword(args.kb, terms, view, args.question);
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

  // Punkt 4 (Nachtrag): Ein exakter Name muss der Qualitaets-
  // Bewertung standhalten.
  //
  // Der Qualitaetsmultiplikator belohnt Faktenmenge und Quellenzahl.
  // Eine Entity mit einem Beleg und drei Fakten bekommt 1.3, eine
  // mit einem Beleg und einem Faktor nur 1.0 — der Faktor verliert
  // gegen die reichere, aber weniger passende Entity. Bei der Frage
  // "Meteor" schlug so "Meteorologie" das gesuchte "Meteor".
  //
  // WICHTIG: Der Vorrang wird VOR der Qualitaetsanrechnung angewandt,
  // nicht danach. Grund: RRF komprimiert die Score-Differenzen — ein
  // Keyword-Score von 25.6 gegen 10.5 wird zu 0.01311 gegen 0.01290,
  // also zu 1.6 % Abstand. Der Qualitaetsmultiplikator (1.3 gegen
  // 1.0) ueberstimmt das. Wer den Vorrang erst danach anrechnet,
  // verliert ihn wieder.
  //
  // Der Vorrang gilt fuer jeden exakten Treffer: die Frage IST der
  // Name ("Meteor") ODER ein Suchbegriff IST der Name ("Bleistift"
  // bei der Frage "Bleistift auf Finger"). Beide Faelle bekommen
  // denselben Vorrang — eine Unterscheidung war messbar nicht
  // noetig, weil bei einer Ein-Wort-Frage der Name ohnehin die Frage
  // ist, und bei einer Mehrwort-Frage der laengere Name gewinnen
  // soll.
  const exactHits = new Set<string>();
  for (const item of fused) {
    const ent = entitiesById.get(item.id);
    const con = item.id.startsWith("concept:")
      ? conceptsById.get(item.id.slice("concept:".length))
      : undefined;
    const nameLower = ent?.name.toLowerCase() ?? con?.name.toLowerCase();
    if (!nameLower) continue;
    if (matchesQuestion(nameLower, args.question)) {
      exactHits.add(item.id);
    }
  }
  for (const item of fused) {
    if (exactHits.has(item.id)) {
      item.score *= EXACT_MATCH_PRIORITY;
    }
  }

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
        if (!seenEntities.has(e.id) && entities.length < maxEntities) {
          seenEntities.add(e.id);
          entities.push(e);
        }
      }
      const matchingConcepts = conceptsBySource.get(s.id) ?? [];
      for (const c of matchingConcepts) {
        if (!seenConcepts.has(c.id) && concepts.length < maxConcepts) {
          seenConcepts.add(c.id);
          concepts.push(c);
        }
      }
    } else if (item.id.startsWith("concept:")) {
      if (concepts.length >= maxConcepts) continue;
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
      if (entities.length >= maxEntities) continue;
      const e = entitiesById.get(item.id);
      if (!e || seenEntities.has(e.id)) continue;
      if (
        RETRIEVAL_ENTITY_BLACKLIST.has(item.id) ||
        RETRIEVAL_ENTITY_BLACKLIST.has(e.name.toLowerCase())
      ) {
        continue;
      }
      // Punkt 4: Eine Entity ohne Quelle hat keinen Beleg und bekommt
      // keine Wiki-Seite — ihr Wissen (die Fakten) ist aber Antwort-wert.
      // `isQualityEntity()` lehnt sie ab, `isRetrievableEntity()` nicht.
      if (!isRetrievableEntity(e)) continue;
      seenEntities.add(e.id);
      entities.push(e);
    }
  }

  // Gather connections that touch retrieved items, prioritizing most relevant ones
  const entityIds = new Set(entities.map((e) => e.id));
  const conceptIds = new Set(concepts.map((c) => c.id));
  const retrievedNodeIds = new Set([...entityIds, ...conceptIds]);

  // Punkt 3: Frueher wurden Verbindungen NUR ueber Entity-IDs
  // gefunden (`entityIds.has(c.from) || entityIds.has(c.to)`). In der
  // Live-KB haben 1.053 von 5.620 Verbindungen ausschliesslich
  // Concept-Endpunkte — die waren nie abrufbar. Beispiel:
  // "kuenstliche-intelligenz -> bildungsprozess-neu-gestalten".
  const candidateConnections = args.kb
    .allConnections()
    .filter(
      (c) =>
        entityIds.has(c.from) ||
        entityIds.has(c.to) ||
        conceptIds.has(c.from) ||
        conceptIds.has(c.to),
    );

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
    .slice(0, maxConnections)
    .map((sc) => sc.connection);

  // Punkt 1a: Die Quellenliste beschraenken.
  //
  // Vorher: die Union aller Quellen der gefundenen Items PLUS aller
  // direkt getroffenen Source-Records. Bei der Frage "Welche Werkzeuge
  // nutzt Harald March im Unterricht?" waren das 659 Quellen und
  // 377 kB Kontext — 92 % des Kontexts. 469 davon waren direkt
  // getroffene Records, die keine einzige Fundstelle belegten.
  //
  // Jetzt: zuerst die Quellen der tatsaechlich gefundenen Items (die
  // belegen etwas), dann — nur falls noch Platz ist — die direkt
  // getroffenen. Jede Quelle ueber `maxSources` faellt weg.
  const relevantSourceIds = new Set<string>();
  for (const e of entities) for (const s of e.sources) relevantSourceIds.add(s);
  for (const c of concepts) for (const s of c.sources) relevantSourceIds.add(s);

  const orderedSourceIds: string[] = [];
  const seenSourceIds = new Set<string>();
  for (const id of relevantSourceIds) {
    if (seenSourceIds.has(id)) continue;
    seenSourceIds.add(id);
    orderedSourceIds.push(id);
  }
  for (const s of directSources) {
    if (seenSourceIds.has(s.id)) continue;
    seenSourceIds.add(s.id);
    orderedSourceIds.push(s.id);
  }

  const sources: SourceRecord[] = [];
  for (const id of orderedSourceIds.slice(0, maxSources)) {
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
    nameById: args.nameById,
  };

  return filterBundleByFolder(bundle, args.folders ?? []);
}
