import type { Entity, Concept, SourceRecord } from "../core/types.js";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function entityFrontmatter(
  entity: Entity,
  today = todayIso(),
): Record<string, unknown> {
  return {
    type: `Entity/${entity.type}`,
    title: entity.name,
    description: entity.facts[0] || `Entität vom Typ ${entity.type}`,
    typ: "entität",
    "entitäts-typ": entity.type,
    name: entity.name,
    aliases: [...entity.aliases],
    tags: ["llm-wiki/entity", `llm-wiki/entity/${entity.type}`],
    sources: entity.sources.map((s) => ({ resource: s, id: s })),
    generated: { by: "llm-wiki-german/1.1.0b", at: `${today}T00:00:00Z` },
    status: "stable",
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
    type: "Concept",
    title: concept.name,
    description: concept.definition || `Konzept ${concept.name}`,
    typ: "konzept",
    name: concept.name,
    aliases: [],
    tags: ["llm-wiki/concept"],
    sources: concept.sources.map((s) => ({ resource: s, id: s })),
    generated: { by: "llm-wiki-german/1.1.0b", at: `${today}T00:00:00Z` },
    status: "stable",
    "quellen-anzahl": concept.sources.length,
    "aktualisiert": today,
    cssclasses: [],
  };
}

export function sourceFrontmatter(
  source: SourceRecord,
): Record<string, unknown> {
  return {
    type: "Source",
    title: source.id,
    description: source.summary,
    typ: "quelle",
    herkunft: source.origin,
    datum: source.date,
    tags: ["llm-wiki/source"],
    generated: { by: "llm-wiki-german/1.1.0b", at: `${source.date}T00:00:00Z` },
    status: "stable",
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

function serializeValue(value: unknown, indentLevel = 0): string {
  const indent = " ".repeat(indentLevel);
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return "{}";
    const lines: string[] = [];
    for (const [k, v] of entries) {
      if (typeof v === "object" && v !== null && !Array.isArray(v)) {
        lines.push(`${indent}${k}:`);
        lines.push(serializeValue(v, indentLevel + 2));
      } else if (Array.isArray(v)) {
        if (v.length === 0) {
          lines.push(`${indent}${k}: []`);
        } else {
          lines.push(`${indent}${k}:`);
          for (const item of v) {
            if (typeof item === "object" && item !== null) {
              lines.push(`${indent}  - ${serializeInlineObject(item)}`);
            } else {
              lines.push(`${indent}  - ${yamlScalar(item)}`);
            }
          }
        }
      } else {
        lines.push(`${indent}${k}: ${yamlScalar(v)}`);
      }
    }
    return lines.join("\n");
  }
  return `${indent}${yamlScalar(value)}`;
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

