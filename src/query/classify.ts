import type { QueryType } from "./types.js";

const LIST_PATTERNS = [
  /\b(what|welche|welcher|welches|welchen)\s+(books|bücher|articles|artikel|tools|werkzeuge|people|leute|personen|places|orte|events|ereignisse|projects|projekte|notizen)\b/i,
  /\b(list|liste|auflisten|nenne|nenn mir|zeige mir|gib mir)\s+(all|alle|die|eine übersicht)\b/i,
  /\b(how many|wie viele)\b/i,
  /\bwhich\s+(books|articles|tools|people)\b/i,
  /\ball\s+the\b/i,
  /\b(übersicht|auflistung)\s+(aller|über|von)\b/i,
];

const ENTITY_PATTERNS = [
  /^(who|wer)\s+(is|ist|was|war|sind|waren)\b/i,
  /^(what|was)\s+(is|ist|was|war|sind|waren)\b/i,
  /^(tell me about|erzähl mir von|erzähle mir von|über)\b/i,
  /^(steckbrief|fakten über|fakten zu|infos zu|informationen zu)\b/i,
];

const RELATIONAL_PATTERNS = [
  /\b(relate(s|d)?|beziehung|verbindung|zusammenhang|einfluss|unterschied|vergleich)\b.*\b(to|zu|zwischen|von|mit)\b/i,
  /\b(connection|verbindung)\s+between\b/i,
  /\b(influence(s|d)?|beeinflusst|beeinflussen|einfluss)\b/i,
  /\bhow\s+does\b.*\b(relate|connect|influence)\b/i,
  /\bwie\s+(hängt|hängen|beeinflusst|beeinflussen|verbunden|stehen)\b/i,
];



export function classifyQuery(text: string): QueryType {
  for (const p of LIST_PATTERNS) if (p.test(text)) return "list_category";
  for (const p of RELATIONAL_PATTERNS) if (p.test(text)) return "relational";
  for (const p of ENTITY_PATTERNS) if (p.test(text)) return "entity_lookup";
  return "conceptual";
}
