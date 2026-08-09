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
  short_description?: string;
}

export interface RawConcept {
  name?: string;
  definition?: string;
  short_description?: string;
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
  source_summary_short?: string;
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
  if (start === -1) return null;
  const end = text.lastIndexOf("}");
  text = end > start ? text.slice(start, end + 1) : text.slice(start);

  let data: unknown = null;
  // Stage 1: Try direct JSON.parse with simple trailing comma removal
  const simpleClean = text.replace(/,(\s*[}\]])/g, "$1");
  try {
    data = JSON.parse(simpleClean);
  } catch {
    // Stage 2: Standard JSON repair (control chars, backslashes, comments, smart quotes, auto-close)
    try {
      const repaired = repairJsonString(text);
      data = JSON.parse(repaired);
    } catch {
      // Stage 3: Aggressive JSON repair (repair unescaped inner quotes in code/HTML strings)
      try {
        const repairedAggressive = repairJsonString(repairUnescapedQuotes(text));
        data = JSON.parse(repairedAggressive);
      } catch {
        return null;
      }
    }
  }

  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return null;
  }

  const d = data as Record<string, unknown>;
  return {
    source_summary: toStr(d.source_summary),
    source_summary_short: toStr(d.source_summary_short),
    entities: Array.isArray(d.entities)
      ? d.entities
          .filter((e): e is Record<string, unknown> => e !== null && typeof e === "object")
          .map((e) => ({
            name: toStr(e.name),
            type: toStr(e.type),
            aliases: toStrArr(e.aliases),
            facts: toStrArr(e.facts),
            short_description: toStr(e.short_description),
          }))
      : [],
    concepts: Array.isArray(d.concepts)
      ? d.concepts
          .filter((c): c is Record<string, unknown> => c !== null && typeof c === "object")
          .map((c) => ({
            name: toStr(c.name),
            definition: toStr(c.definition),
            short_description: toStr(c.short_description),
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

// ---------------------------------------------------------------------------
// JSON Repair Helpers
// ---------------------------------------------------------------------------

function removeJsComments(input: string): string {
  let result = "";
  let inString = false;
  let isEscaped = false;
  let i = 0;

  while (i < input.length) {
    const char = input[i];

    if (inString) {
      result += char;
      if (isEscaped) {
        isEscaped = false;
      } else if (char === "\\") {
        isEscaped = true;
      } else if (char === '"') {
        inString = false;
      }
      i++;
    } else {
      if (char === '"') {
        inString = true;
        result += char;
        i++;
      } else if (char === "/" && input[i + 1] === "/") {
        i += 2;
        while (i < input.length && input[i] !== "\n" && input[i] !== "\r") {
          i++;
        }
      } else if (char === "/" && input[i + 1] === "*") {
        i += 2;
        while (i < input.length - 1 && !(input[i] === "*" && input[i + 1] === "/")) {
          i++;
        }
        i += 2;
      } else {
        result += char;
        i++;
      }
    }
  }

  return result;
}

function repairJsonString(input: string): string {
  let s = input.replace(/[“”„]/g, '"').replace(/[‘’]/g, "'");
  s = removeJsComments(s);

  let result = "";
  let inString = false;
  let isEscaped = false;

  for (let i = 0; i < s.length; i++) {
    const char = s[i];

    if (inString) {
      if (isEscaped) {
        if (/["\\/bfnrtu]/.test(char)) {
          result += char;
        } else {
          result += "\\" + char;
        }
        isEscaped = false;
      } else if (char === "\\") {
        isEscaped = true;
        result += char;
      } else if (char === '"') {
        inString = false;
        result += char;
      } else if (char === "\n") {
        result += "\\n";
      } else if (char === "\r") {
        result += "\\r";
      } else if (char === "\t") {
        result += "\\t";
      } else {
        result += char;
      }
    } else {
      if (char === '"') {
        inString = true;
        result += char;
      } else {
        result += char;
      }
    }
  }

  if (inString) {
    result += '"';
  }

  result = result.replace(/,(\s*[}\]])/g, "$1");
  return autoCloseJson(result);
}

function repairUnescapedQuotes(input: string): string {
  let result = "";
  let inString = false;
  let isEscaped = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (inString) {
      if (isEscaped) {
        result += char;
        isEscaped = false;
      } else if (char === "\\") {
        result += char;
        isEscaped = true;
      } else if (char === '"') {
        const rest = input.slice(i + 1).trimStart();
        const nextChar = rest[0];
        if (
          nextChar === ":" ||
          nextChar === "," ||
          nextChar === "}" ||
          nextChar === "]" ||
          nextChar === undefined
        ) {
          inString = false;
          result += '"';
        } else {
          result += '\\"';
        }
      } else {
        result += char;
      }
    } else {
      if (char === '"') {
        inString = true;
        result += char;
      } else {
        result += char;
      }
    }
  }

  return result;
}

function autoCloseJson(input: string): string {
  const stack: Array<"{" | "["> = [];
  let inString = false;
  let isEscaped = false;

  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (inString) {
      if (isEscaped) isEscaped = false;
      else if (c === "\\") isEscaped = true;
      else if (c === '"') inString = false;
    } else {
      if (c === '"') inString = true;
      else if (c === "{") stack.push("{");
      else if (c === "[") stack.push("[");
      else if (c === "}") {
        if (stack.length > 0 && stack[stack.length - 1] === "{") stack.pop();
      } else if (c === "]") {
        if (stack.length > 0 && stack[stack.length - 1] === "[") stack.pop();
      }
    }
  }

  let suffix = "";
  while (stack.length > 0) {
    const top = stack.pop();
    suffix += top === "{" ? "}" : "]";
  }

  return input + suffix;
}
