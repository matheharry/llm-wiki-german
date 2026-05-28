import type { QueryType } from "./types.js";

const LIST_PATTERNS = [
  /\b(what|welche)\s+(books|bücher|articles|artikel|tools|werkzeuge|people|leute|personen|places|orte|events|ereignisse|projects|projekte)\b/i,
  /\b(list|liste|auflisten)\s+(all|alle|die)\b/i,
  /\b(how many|wie viele)\b/i,
  /\bwhich\s+(books|articles|tools|people)\b/i,
  /\ball\s+the\b/i,
];

const ENTITY_PATTERNS = [
  /^(who|wer)\s+(is|ist|was|war)\b/i,
  /^(what|was)\s+(is|ist|was|war)\b/i,
  /^(tell me about|erzähl mir von|über)\b/i,
];

const RELATIONAL_PATTERNS = [
  /\b(relate(s|d)?|beziehung|verbindung|zusammenhang)\s+(to|zu|zwischen)\b/i,
  /\b(connection|verbindung)\s+between\b/i,
  /\b(influence(s|d)?|beeinflusst|einfluss)\b/i,
  /\bhow\s+does\b.*\b(relate|connect|influence)\b/i,
  /\bwie\s+(hängt|beeinflusst|verbunden)\b/i,
];

export function classifyQuery(text: string): QueryType {
  for (const p of LIST_PATTERNS) if (p.test(text)) return "list_category";
  for (const p of RELATIONAL_PATTERNS) if (p.test(text)) return "relational";
  for (const p of ENTITY_PATTERNS) if (p.test(text)) return "entity_lookup";
  return "conceptual";
}
