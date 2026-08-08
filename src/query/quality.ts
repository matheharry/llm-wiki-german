import type { KnowledgeBase } from "../core/kb.js";
import type { EntityType } from "../core/types.js";

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

/**
 * Soft re-ranking multiplier applied AFTER RRF.
 * Looks up the entity/concept by canonical id (the slug stored on the
 * record itself, not a re-derived form of the name). Both rankers and
 * `retrieve()` emit ids in this canonical form.
 */
export function qualityMultiplier(id: string, kb: KnowledgeBase): number {
  if (id.startsWith("source:")) {
    const sourceId = id.slice("source:".length);
    const source = kb.allSources().find((s) => s.id === sourceId);
    if (!source) return 1.0;
    let m = 1.2;
    if (source.summary) m *= 1.2;
    m *= getTrustBoost(source.verified);
    return m;
  }

  // Concept ids are prefixed
  if (id.startsWith("concept:")) {
    const conceptId = id.slice("concept:".length);
    const concept = kb.allConcepts().find((c) => c.id === conceptId);
    if (!concept) return 1.0;
    let m = 1.0;
    const hasDef = typeof concept.definition === "string" && concept.definition.trim().length > 0;
    const hasRelated = (concept.related?.length ?? 0) > 0;
    if (hasDef && hasRelated) m *= 1.2;
    if (!hasDef) m *= 0.5;
    m *= getTrustBoost(concept.verified);
    return m;
  }

  const entity = kb.allEntities().find((e) => e.id === id);
  if (!entity) return 1.0;

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
