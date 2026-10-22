import type { Concept, Entity } from "./types.js";

/** Hardcoded quality thresholds for page generation. */
const MIN_FACTS_PER_ENTITY = 1;
const MIN_SOURCES_PER_ENTITY = 1;

export const ENTITY_BLACKLIST = new Set([
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
export const CONCEPT_BLACKLIST = new Set([
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

/** Common file extensions used in vaults and desktop notes/documents. */
const FILE_EXT_REGEX =
  /\.(md|markdown|canvas|txt|pdf|png|jpg|jpeg|gif|svg|json|csv|docx|xlsx|pptx|html|htm|py|ts)$/i;

/** Common vault root folders or system folders that indicate a path when followed by / or \. */
const VAULT_FOLDER_PREFIX_REGEX =
  /^(?:notizen|notes|tools|daily|journal|quellen|sources|wiki|templates|vorlagen|archiv|archive|inbox|eingang|attachments?|assets?|bücher|books|literatur|projekte|projects|docs|src|lib|test|tests|bin|app|pages|components|public)[/\\]/i;

/**
 * Strips legitimate textual slash patterns (dates, fractions, acronyms,
 * paired concepts, gender forms, units, parenthetical explanations) from a string,
 * leaving only slashes that are likely path separators.
 */
function stripLegitimateSlashes(text: string): string {
  let s = text;

  // 1. Slashes inside balanced parentheses, brackets or quotes:
  // e.g. "(Key/Value Cache)", "(z. B. 2027/28)", "[A/B]", "\"Key/Value\""
  s = s.replace(/\([^)]*\)/g, (match) => match.replace(/\//g, " "));
  s = s.replace(/\[[^\]]*\]/g, (match) => match.replace(/\//g, " "));
  s = s.replace(/\{[^}]*\}/g, (match) => match.replace(/\//g, " "));
  s = s.replace(/"[^"]*"/g, (match) => match.replace(/\//g, " "));
  s = s.replace(/'[^']*'/g, (match) => match.replace(/\//g, " "));
  s = s.replace(/“[^”]*”/g, (match) => match.replace(/\//g, " "));
  s = s.replace(/„[^“]*“/g, (match) => match.replace(/\//g, " "));
  s = s.replace(/«[^»]*»/g, (match) => match.replace(/\//g, " "));

  // 2. Numbers, years, dates, fractions, ratios:
  // e.g. "2027/28", "2023/2024", "24/7", "50/50", "1/2", "10/2026"
  s = s.replace(/(?<![\p{L}\p{N}])\d+\s*\/\s*\d+(?![\p{L}\p{N}])/gu, " ");

  // 3. Units of measurement:
  // e.g. "km/h", "m/s", "kW/h", "kWh/d", "W/mK", "g/mol", "U/min", "l/min", "MB/s"
  s = s.replace(
    /(?<![\p{L}\p{N}])(?:km|m|cm|mm|kg|g|mg|kW|kWh|W|l|ml|mol|U|B|KB|MB|GB|TB|bit|kbit|Mbit|Gbit)\s*\/\s*(?:h|s|min|d|a|m|m2|m3|kg|g|l|mol|K|W|Wh|VA)(?![\p{L}\p{N}])/giu,
    " ",
  );

  // 4. German hyphenated alternatives, word parts, and gender-inclusive forms:
  // e.g. "Ein-/Ausgabe", "Hard-/Software", "Vor-/Nachteile", "Mitarbeiter/-innen", "Bürger/in"
  s = s.replace(/(?<![\p{L}\p{N}])\p{L}+-\/\p{L}+(?![\p{L}\p{N}])/gu, " ");
  s = s.replace(/(?<![\p{L}\p{N}])\p{L}+\/-\p{L}+(?![\p{L}\p{N}])/gu, " ");
  s = s.replace(/(?<![\p{L}\p{N}])\p{L}+\/(?:innen|in)(?![\p{L}\p{N}])/giu, " ");

  // 5. Known technical acronyms and short abbreviations:
  // e.g. "CI/CD", "TCP/IP", "I/O", "AC/DC", "OS/2", "CP/M", "PL/SQL", "S/4HANA", "B/S", "A/B", "R/W", "w/o", "c/o", "n/a"
  s = s.replace(
    /(?<![\p{L}\p{N}])(?:CI\/CD|TCP\/IP|I\/O|AC\/DC|OS\/2|CP\/M|PL\/SQL|S\/4HANA|B\/S|A\/B|R\/W|PR\/FAQ|w\/o|c\/o|n\/a)(?![\p{L}\p{N}])/giu,
    " ",
  );

  // 6. Common conjunctions:
  // e.g. "und/oder", "and/or", "either/or", "weder/noch", "pro/contra", "pro/kontra"
  s = s.replace(/(?<![\p{L}\p{N}])(?:und\/oder|and\/or|either\/or|weder\/noch|pro\/contra|pro\/kontra)(?![\p{L}\p{N}])/giu, " ");

  // 7. Known conceptual word pairs:
  // e.g. "Key/Value", "Client/Server", "Frontend/Backend", "Input/Output", "Read/Write", "Kosten/Nutzen"
  s = s.replace(
    /(?<![\p{L}\p{N}])(?:key\/value|client\/server|frontend\/backend|input\/output|read\/write|read\/only|get\/set|true\/false|soll\/haben|soll\/ist|ist\/soll|gewinn\/verlust|einnahmen\/ausgaben|aufwand\/ertrag|aktiva\/passiva|debit\/credit|kauf\/verkauf|biete\/suche|ankunft\/abreise|an\/abreise|auf\/abbau|ein\/ausgabe|hard\/software|hardware\/software|vor\/nachteile|top\/down|bottom\/up|master\/slave|sender\/empfänger|request\/response|import\/export|in\/export|public\/private|push\/pull|black\/white|source\/target|source\/destination|kosten\/nutzen|preis\/leistung|mensch\/maschine|ursache\/wirkung|frage\/antwort|tag\/nacht|hell\/dunkel|arm\/reich|stadt\/land|geben\/nehmen|chance\/risiko|chancen\/risiken|stärken\/schwächen|vor\/nachbereitung|innen\/außen|gut\/böse|wahr\/falsch|ja\/nein|online\/offline|analog\/digital|lead\/lag|peer\/peer)(?![\p{L}\p{N}])/giu,
    " ",
  );

  // 8. Slashes with surrounding spaces in natural text:
  // e.g. "Konzept A / Konzept B"
  s = s.replace(/(?<=\S)\s+\/\s*(?=\S)|(?<=\S)\s*\/\s+(?=\S)/g, " ");

  return s;
}

export function isFileNameOrPathLike(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return false;

  // Explicit file extensions (.md, .pdf, .json, etc.)
  if (FILE_EXT_REGEX.test(trimmed)) return true;
  if (
    /\.js$/i.test(trimmed) &&
    !/\b(?:node|vue|next|nuxt|react|express|three|d3|chart|angular|backbone|ember|alpine|electron|deno|bun)\.js$/i.test(
      trimmed,
    )
  ) {
    return true;
  }

  // Explicit path indicators: starts with /, \, ./, ../, ~/, or drive letter C:\ or C:/
  if (/^(?:[a-zA-Z]:[/\\]|\.{1,2}[/\\]|~[/\\]|[/\\])/.test(trimmed)) return true;

  // Ends with / or \ (folder path)
  if (/[/\\]$/.test(trimmed)) return true;

  // Windows backslash path separators
  if (trimmed.includes("\\")) return true;

  // If no forward slashes remain, it's not a path
  if (!trimmed.includes("/")) return false;

  // Common vault folder prefix: "Notizen/...", "Tools/...", "Notes/..."
  if (VAULT_FOLDER_PREFIX_REGEX.test(trimmed)) return true;

  // Check if remaining slashes are legitimate conceptual slashes
  const remaining = stripLegitimateSlashes(trimmed);
  return remaining.includes("/");
}

export function isQualityEntity(e: Entity): boolean {
  const lower = e.name.trim().toLowerCase();
  if (ENTITY_BLACKLIST.has(lower)) return false;
  if (isFileNameOrPathLike(e.name)) return false;
  if (e.facts.length === 0 && e.aliases.length === 0) return false;
  if (e.facts.length < MIN_FACTS_PER_ENTITY) return false;
  if (e.sources.length < MIN_SOURCES_PER_ENTITY) return false;
  return true;
}

/**
 * Wie `isQualityEntity`, aber ohne die Quellen-Anforderung.
 *
 * Hintergrund: Eine Entity ohne Quelle hat keinen Beleg — sie ist im
 * Wiki keine Seite wert. In der *Abfrage* ist sie aber trotzdem
 * nutzbar: sie hat Fakten, die das LLM beantworten kann.
 *
 * Vor der Umstellung auf 300-Byte-Minimumdateigroesse und der
 * Bereinigung verwaister Source-Records fielen 21 Entities mit
 * zusammen 60 Faktoren durch das Raster — ihr Wissen war im KB, aber
 * unerreichbar. Das ist Wissenverlust ohne Nutzen: die Seite fehlt
 * zurecht (kein Beleg), die Antwort faellt aber nicht aus.
 *
 * Die beiden Pruefungen sind deshalb getrennt:
 *  - `isQualityEntity()`  -> erzeugt eine Wiki-Seite
 *  - `isRetrievableEntity()` -> darf in eine Antwort einfliesen
 */
export function isRetrievableEntity(e: Entity): boolean {
  const lower = e.name.trim().toLowerCase();
  if (ENTITY_BLACKLIST.has(lower)) return false;
  if (isFileNameOrPathLike(e.name)) return false;
  if (e.facts.length === 0 && e.aliases.length === 0) return false;
  if (e.facts.length < MIN_FACTS_PER_ENTITY) return false;
  return true;
}

export function isQualityConcept(c: Concept): boolean {
  const lower = c.name.trim().toLowerCase();
  if (CONCEPT_BLACKLIST.has(lower)) return false;
  if (isFileNameOrPathLike(c.name)) return false;
  if (!c.definition || typeof c.definition !== "string" || c.definition.trim().length === 0) return false;
  return true;
}

