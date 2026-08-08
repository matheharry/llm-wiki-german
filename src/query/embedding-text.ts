import type { Concept, Entity, SourceRecord } from "../core/types.js";

const MAX_FACTS = 5;
const MAX_DEF = 200;

export function contextualTextForEntity(e: Entity): string {
  const parts: string[] = [`Entität [${e.type}]: ${e.name}.`];
  if (e.aliases.length > 0) {
    parts.push(`Auch bekannt als: ${e.aliases.join(", ")}.`);
  }
  if (e.facts.length > 0) {
    parts.push(e.facts.slice(0, MAX_FACTS).join(" "));
  }
  return parts.join(" ");
}

export function contextualTextForConcept(c: Concept): string {
  const def = (c.definition ?? "").slice(0, MAX_DEF);
  const parts: string[] = [`Konzept: ${c.name}.`];
  if (def.length > 0) parts.push(def);
  if (c.related && c.related.length > 0) {
    const related = Array.isArray(c.related) ? c.related : [c.related];
    parts.push(`Verwandt mit: ${related.join(", ")}.`);
  }
  return parts.join(" ");
}

export function contextualTextForSource(s: SourceRecord): string {
  const parts: string[] = [`Quellseite: ${s.id}.`];
  if (s.summary) parts.push(`Zusammenfassung: ${s.summary}.`);
  return parts.join(" ");
}

