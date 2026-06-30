/**
 * Robust parser for LLM extraction responses. Handles the quirks we have
 * seen in practice from small (7B) models: markdown fences, trailing
 * commas, preamble/postamble text. Ported from
 * ~/tools/llm-wiki/extract.py (parse_extraction) and
 * ~/tools/llm-wiki/parser.py.
 *
 * Returns null if the response cannot be coerced into the expected shape.
 * Never throws. The extraction pipeline treats `null` as a failed file.
 */

export interface RawEntity {
  name?: string;
  type?: string;
  aliases?: string[];
  facts?: string[];
}

export interface RawConcept {
  name?: string;
  definition?: string;
  related?: string[];
}

export interface RawConnection {
  from?: string;
  to?: string;
  type?: string;
  description?: string;
}

export interface ParsedExtraction {
  source_summary: string;
  entities: RawEntity[];
  concepts: RawConcept[];
  connections: RawConnection[];
}

/** Coerce an unknown value to a trimmed string. */
function toStr(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

/** Coerce an unknown value to a string array. */
function toStrArr(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((item) => toStr(item)).filter((s) => s.length > 0);
}

export function parseExtraction(raw: string): ParsedExtraction | null {
  if (!raw) return null;
  let text = raw.trim();
  if (!text) return null;

  // Strip leading ```json or ``` fences and trailing ``` fences.
  text = text.replace(/^```(?:json)?\s*\n?/i, "");
  text = text.replace(/\n?```\s*$/i, "");
  text = text.trim();

  // Find the outermost { ... } — allows preamble/postamble noise.
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  text = text.slice(start, end + 1);

  // Fix trailing commas (JSON does not allow them; 7B models produce them).
  text = text.replace(/,(\s*[}\]])/g, "$1");

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return null;
  }

  const d = data as Record<string, unknown>;
  return {
    source_summary: toStr(d.source_summary),
    entities: Array.isArray(d.entities)
      ? d.entities
          .filter((e): e is Record<string, unknown> => e !== null && typeof e === "object")
          .map((e) => ({
            name: toStr(e.name),
            type: toStr(e.type),
            aliases: toStrArr(e.aliases),
            facts: toStrArr(e.facts),
          }))
      : [],
    concepts: Array.isArray(d.concepts)
      ? d.concepts
          .filter((c): c is Record<string, unknown> => c !== null && typeof c === "object")
          .map((c) => ({
            name: toStr(c.name),
            definition: toStr(c.definition),
            related: toStrArr(c.related),
          }))
      : [],
    connections: Array.isArray(d.connections)
      ? d.connections
          .filter((c): c is Record<string, unknown> => c !== null && typeof c === "object")
          .map((c) => ({
            from: toStr(c.from),
            to: toStr(c.to),
            type: toStr(c.type),
            description: toStr(c.description),
          }))
      : [],
  };
}
