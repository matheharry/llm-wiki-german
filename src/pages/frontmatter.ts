import type { Entity, Concept, SourceRecord } from "../core/types.js";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Extracts the first sentence from a text string (ending in . ! or ?).
 * Used to guarantee OKF v0.2 §4.1 compliance (`description` MUST be a single sentence).
 */
export function toFirstSentence(text: string | undefined | null): string {
  if (!text) return "";
  const trimmed = text.trim();
  if (!trimmed) return "";
  const match = trimmed.match(/^([^.!?]+[.!?])/);
  if (match && match[1]) {
    return match[1].trim();
  }
  return trimmed;
}

export function entityFrontmatter(
  entity: Entity,
  today = todayIso(),
): Record<string, unknown> {
  const desc =
    toFirstSentence(entity.shortDescription || entity.facts[0]) ||
    `Entität vom Typ ${entity.type}`;
  // Use the stable creation date when available; fall back to `today`
  // only for legacy entries that predate `generatedAt`.
  const generatedAt = entity.generatedAt || today;
  const fm: Record<string, unknown> = {
    type: `Entity/${entity.type}`,
    title: entity.name,
    description: desc,
    typ: "entität",
    "entitäts-typ": entity.type,
    name: entity.name,
    aliases: [...entity.aliases],
    tags: ["llm-wiki/entity", `llm-wiki/entity/${entity.type}`],
    sources: entity.sources.map((s) => ({ resource: s, id: s })),
    generated: { by: entity.generatedBy || "llm-wiki-german/1.1.0c", at: `${generatedAt}T00:00:00Z` },
    status: "stable",
    "quellen-anzahl": entity.sources.length,
    "aktualisiert": generatedAt,
    cssclasses: [],
  };
  if (entity.verified) fm["verified"] = entity.verified;
  if (entity.staleAfter) fm["stale_after"] = entity.staleAfter;
  return fm;
}

export function conceptFrontmatter(
  concept: Concept,
  today = todayIso(),
): Record<string, unknown> {
  const desc =
    toFirstSentence(concept.shortDescription || concept.definition) ||
    `Konzept ${concept.name}`;
  // Use the stable creation date when available; fall back to `today`
  // only for legacy entries that predate `generatedAt`.
  const generatedAt = concept.generatedAt || today;
  const fm: Record<string, unknown> = {
    type: "Concept",
    title: concept.name,
    description: desc,
    typ: "konzept",
    name: concept.name,
    aliases: [],
    tags: ["llm-wiki/concept"],
    sources: concept.sources.map((s) => ({ resource: s, id: s })),
    generated: { by: concept.generatedBy || "llm-wiki-german/1.1.0c", at: `${generatedAt}T00:00:00Z` },
    status: "stable",
    "quellen-anzahl": concept.sources.length,
    "aktualisiert": generatedAt,
    cssclasses: [],
  };
  if (concept.verified) fm["verified"] = concept.verified;
  if (concept.staleAfter) fm["stale_after"] = concept.staleAfter;
  return fm;
}

export function sourceFrontmatter(
  source: SourceRecord,
): Record<string, unknown> {
  const desc =
    toFirstSentence(source.shortDescription || source.summary) ||
    `Quelle ${source.id}`;
  const fm: Record<string, unknown> = {
    type: "Source",
    title: source.id,
    description: desc,
    typ: "quelle",
    herkunft: source.origin,
    datum: source.date,
    tags: ["llm-wiki/source"],
    generated: { by: source.generatedBy || "llm-wiki-german/1.1.0c", at: `${source.date}T00:00:00Z` },
    status: "stable",
    aliases: [],
    cssclasses: [],
  };
  if (source.verified) fm["verified"] = source.verified;
  if (source.staleAfter) fm["stale_after"] = source.staleAfter;
  return fm;
}

function yamlScalar(value: unknown): string {
  if (typeof value === "string") {
    // Quote if value contains YAML-unsafe characters
    if (/[:{}[\],#&*!|>'"%@`]/.test(value) || value.trim() !== value) {
      return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    }
    return value;
  }
  return String(value);
}

function serializeInlineObject(obj: object): string {
  const entries = Object.entries(obj as Record<string, unknown>);
  const pairs = entries.map(([k, v]) => `${k}: ${yamlScalar(v)}`);
  return `{ ${pairs.join(", ")} }`;
}

/**
 * Serialize a frontmatter object to a YAML block (including --- delimiters).
 * Handles strings, numbers, booleans, objects, and arrays.
 */
export function serializeFrontmatter(fm: Record<string, unknown>): string {
  const lines = ["---"];
  for (const [key, value] of Object.entries(fm)) {
    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${key}: []`);
      } else {
        lines.push(`${key}:`);
        for (const item of value) {
          if (typeof item === "object" && item !== null) {
            lines.push(`  - ${serializeInlineObject(item)}`);
          } else {
            lines.push(`  - ${yamlScalar(item)}`);
          }
        }
      }
    } else if (typeof value === "object" && value !== null) {
      lines.push(`${key}: ${serializeInlineObject(value)}`);
    } else {
      lines.push(`${key}: ${yamlScalar(value)}`);
    }
  }
  lines.push("---");
  return lines.join("\n") + "\n";
}

