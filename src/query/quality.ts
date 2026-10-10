import type { KnowledgeBase } from "../core/kb.js";
import type {
  Concept,
  Entity,
  EntityType,
  SourceRecord,
} from "../core/types.js";

export const RETRIEVAL_ENTITY_BLACKLIST: ReadonlySet<string> = new Set([
  "exact name",
  "exact-name",
]);

export const RETRIEVAL_CONCEPT_BLACKLIST: ReadonlySet<string> = new Set([
  "address book",
  "address-book",
]);

const TYPE_SYNONYMS: ReadonlyMap<string, EntityType> = new Map([
  ["person", "person"],
  ["people", "person"],
  ["who", "person"],
  ["org", "org"],
  ["orgs", "org"],
  ["company", "org"],
  ["companies", "org"],
  ["organization", "org"],
  ["book", "book"],
  ["books", "book"],
  ["read", "book"],
  ["tool", "tool"],
  ["tools", "tool"],
  ["project", "project"],
  ["projects", "project"],
  ["article", "article"],
  ["articles", "article"],
  ["place", "place"],
  ["places", "place"],
  ["event", "event"],
  ["events", "event"],

  // German
  ["wer", "person"],
  ["leute", "person"],
  ["personen", "person"],
  ["organisation", "org"],
  ["firma", "org"],
  ["unternehmen", "org"],
  ["buch", "book"],
  ["bücher", "book"],
  ["werkzeug", "tool"],
  ["tools", "tool"],
  ["projekt", "project"],
  ["projekte", "project"],
  ["artikel", "article"],
  ["ort", "place"],
  ["orte", "place"],
  ["ereignis", "event"],
  ["event", "event"],
]);

export function detectTypeHint(terms: readonly string[]): EntityType | null {
  for (const t of terms) {
    const hit = TYPE_SYNONYMS.get(t);
    if (hit) return hit;
  }
  return null;
}

function getTrustBoost(verified: unknown): number {
  if (!verified) return 1.0;
  const list = Array.isArray(verified) ? verified : [verified];
  if (list.some((v) => typeof v === "object" && v !== null && typeof (v as { by?: unknown }).by === "string" && (v as { by: string }).by.startsWith("human:"))) {
    return 1.35; // Human-reviewed OKF Trust Tier
  }
  if (list.length > 0) {
    return 1.15; // Machine-confirmed OKF Trust Tier
  }
  return 1.0;
}

function multiplierForSource(source: SourceRecord): number {
  let m = 1.2;
  if (source.summary) m *= 1.2;
  m *= getTrustBoost(source.verified);
  return m;
}

function multiplierForConcept(concept: Concept): number {
  let m = 1.0;
  const hasDef =
    typeof concept.definition === "string" && concept.definition.trim().length > 0;
  const hasRelated = (concept.related?.length ?? 0) > 0;
  if (hasDef && hasRelated) m *= 1.2;
  if (!hasDef) m *= 0.5;
  m *= getTrustBoost(concept.verified);
  return m;
}

function multiplierForEntity(entity: Entity): number {
  let m = 1.0;
  if (entity.facts.length >= 3) m *= 1.3;
  if (entity.facts.length === 0) m *= 0.3;
  if (entity.sources.length >= 3) m *= 1.1;

  const allTwitter =
    entity.sources.length > 0 &&
    entity.sources.every((s) => s.toLowerCase().startsWith("twitter/"));
  if (allTwitter) m *= 0.3;

  m *= getTrustBoost(entity.verified);

  return m;
}

/** Id-keyed record maps so quality scoring is O(1) per item. */
export interface QualityLookup {
  entities: ReadonlyMap<string, Entity>;
  concepts: ReadonlyMap<string, Concept>;
  sources: ReadonlyMap<string, SourceRecord>;
}

/**
 * Soft re-ranking multiplier applied AFTER RRF.
 * Looks up the entity/concept by canonical id (the slug stored on the
 * record itself, not a re-derived form of the name). Both rankers and
 * `retrieve()` emit ids in this canonical form.
 *
 * This factory builds nothing per call: pass the maps `retrieve()` already
 * computed. Calling the standalone `qualityMultiplier(id, kb)` instead would
 * rebuild three lookup maps per item — an O(n²) scan across a fused ranking
 * that can contain every record in the KB.
 */
export function createQualityMultiplier(
  lookup: QualityLookup,
): (id: string) => number {
  return (id: string): number => {
    if (id.startsWith("source:")) {
      const source = lookup.sources.get(id.slice("source:".length));
      return source ? multiplierForSource(source) : 1.0;
    }

    // Concept ids are prefixed
    if (id.startsWith("concept:")) {
      const concept = lookup.concepts.get(id.slice("concept:".length));
      return concept ? multiplierForConcept(concept) : 1.0;
    }

    const entity = lookup.entities.get(id);
    return entity ? multiplierForEntity(entity) : 1.0;
  };
}

/**
 * Convenience wrapper for one-off callers and tests. Builds the lookup maps
 * once for a single id — prefer `createQualityMultiplier` when scoring a
 * whole ranked list.
 */
export function qualityMultiplier(id: string, kb: KnowledgeBase): number {
  const entities = new Map<string, Entity>();
  for (const e of kb.allEntities()) entities.set(e.id, e);
  const concepts = new Map<string, Concept>();
  for (const c of kb.allConcepts()) concepts.set(c.id, c);
  const sources = new Map<string, SourceRecord>();
  for (const s of kb.allSources()) sources.set(s.id, s);
  return createQualityMultiplier({ entities, concepts, sources })(id);
}
