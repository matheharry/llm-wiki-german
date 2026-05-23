import type { Concept, Entity } from "./types.js";

/** Hardcoded quality thresholds for page generation. */
const MIN_FACTS_PER_ENTITY = 1;
const MIN_SOURCES_PER_ENTITY = 1;

const ENTITY_BLACKLIST = new Set([
  "exact name",
  "exact-name",
  "unbekannt",
  "nicht angegeben",
  "unbekannte person",
  "unbekannte organisation",
  "unbekanntes objekt",
  "keine angabe",
  "n/a",
]);
const CONCEPT_BLACKLIST = new Set([
  "address book",
  "address-book",
  "unbekanntes konzept",
  "zusammenhang",
  "aspekt",
  "aspekte",
  "themen",
  "bereich",
  "bereiche",
  "beziehung",
  "bedeutung",
  "hintergrund",
  "grundlage",
  "grundlagen",
  "eigenschaft",
  "eigenschaften",
  "detail",
  "details",
  "information",
  "informationen",
]);

export function isQualityEntity(e: Entity): boolean {
  const lower = e.name.trim().toLowerCase();
  if (ENTITY_BLACKLIST.has(lower)) return false;
  if (e.facts.length === 0 && e.aliases.length === 0) return false;
  if (e.facts.length < MIN_FACTS_PER_ENTITY) return false;
  if (e.sources.length < MIN_SOURCES_PER_ENTITY) return false;
  return true;
}

export function isQualityConcept(c: Concept): boolean {
  const lower = c.name.trim().toLowerCase();
  if (CONCEPT_BLACKLIST.has(lower)) return false;
  if (!c.definition || c.definition.trim().length === 0) return false;
  return true;
}
