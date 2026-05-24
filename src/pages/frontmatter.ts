import type { Entity, Concept, SourceRecord } from "../core/types.js";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function entityFrontmatter(
  entity: Entity,
  today = todayIso(),
): Record<string, unknown> {
  return {
    typ: "entität",
    "entitäts-typ": entity.type,
    name: entity.name,
    aliases: [...entity.aliases],
    tags: ["llm-wiki/entity", `llm-wiki/entity/${entity.type}`],
    "quellen-anzahl": entity.sources.length,
    "aktualisiert": today,
    cssclasses: [],
  };
}

export function conceptFrontmatter(
  concept: Concept,
  today = todayIso(),
): Record<string, unknown> {
  return {
    typ: "konzept",
    name: concept.name,
    aliases: [],
    tags: ["llm-wiki/concept"],
    "quellen-anzahl": concept.sources.length,
    "aktualisiert": today,
    cssclasses: [],
  };
}

export function sourceFrontmatter(
  source: SourceRecord,
): Record<string, unknown> {
  return {
    typ: "quelle",
    herkunft: source.origin,
    datum: source.date,
    tags: ["llm-wiki/source"],
    aliases: [],
    cssclasses: [],
  };
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

/**
 * Serialize a frontmatter object to a YAML block (including --- delimiters).
 * Handles strings, numbers, booleans, and arrays of primitives.
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
          lines.push(`  - ${yamlScalar(item)}`);
        }
      }
    } else {
      lines.push(`${key}: ${yamlScalar(value)}`);
    }
  }
  lines.push("---");
  return lines.join("\n") + "\n";
}
