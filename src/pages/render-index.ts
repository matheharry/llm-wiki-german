import type { KnowledgeBase } from "../core/kb.js";
import { isQualityEntity, isQualityConcept } from "../core/filters.js";
import { serializeFrontmatter } from "./frontmatter.js";
import { toLinkLabel } from "../core/link-text.js";

const ENTITY_TYPE_LABELS: Record<string, string> = {
  person: "Personen",
  org: "Organisationen",
  tool: "Werkzeuge",
  project: "Projekte",
  book: "Bücher",
  article: "Artikel",
  place: "Orte",
  event: "Ereignisse",
  other: "Sonstiges",
};

const TYPE_ORDER = [
  "person",
  "org",
  "project",
  "tool",
  "book",
  "article",
  "place",
  "event",
  "other",
];

/**
 * Maximale Länge der Vorschau im Index.
 *
 * Ohne Cap war der Index 2,7 MB — die Definitionen (Ø 247 Zeichen) und
 * Quellen-Summaries (Ø 493 Zeichen) machten den grössten Teil aus. Der
 * Index ist eine ÜBERSICHT; die vollständigen Texte stehen auf den
 * jeweiligen Seiten. 120 Zeichen reichen, um den Begriff beim Lesen zu
 * erkennen.
 */
export const INDEX_PREVIEW_CAP = 120;

/**
 * Kürzt einen Text auf maximal `cap` Zeichen und hängt ein Auslassungszeichen
 * an, wenn gekürzt wurde. Bricht an einem Wort- oder Satzende, damit kein
 * halbes Wort im Index steht.
 */
export function previewText(text: string, cap = INDEX_PREVIEW_CAP): string {
  const trimmed = (text ?? "").trim();
  if (trimmed.length <= cap) return trimmed;

  const slice = trimmed.slice(0, cap);
  // Letztes Trennzeichen in den letzten 30 % finden, damit der Text nicht
  // mitten im Satz abgeschnitten wirkt.
  const lastBreak = Math.max(
    slice.lastIndexOf(" "),
    slice.lastIndexOf(", "),
    slice.lastIndexOf(". "),
    slice.lastIndexOf("; "),
  );
  const cut = lastBreak > cap * 0.6 ? slice.slice(0, lastBreak) : slice;
  return `${cut.trimEnd()} …`;
}

/**
 * Unterteilt Einträge in alphabetische Gruppen.
 *
 * Ohne Aufteilung hatte der Index über 10.000 Zeilen — ein einzelner
 * Abschnitt "Konzepte" war nicht mehr durchsuchbar. Die Wiki-Konvention
 * sieht vor, einen Abschnitt ab 50 Einträgen zu unterteilen.
 */
export function groupByInitial<T extends { name: string }>(
  items: T[],
): Array<{ letter: string; items: T[] }> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    // Der erste alphanumerische Buchstabe. Zeichen wie Anführungszeichen,
    // Klammern oder Gedankenstriche am Anfang werden ignoriert — "„Klima""
    // gehört unter K, nicht unter " oder #.
    const match = item.name.match(/[\p{L}\p{N}]/u);
    const letter = match ? match[0].toUpperCase() : "#";
    const list = groups.get(letter);
    if (list) list.push(item);
    else groups.set(letter, [item]);
  }
  return [...groups.entries()]
    .map(([letter, groupItems]) => ({ letter, items: groupItems }))
    .sort((a, b) => {
      // "#" (Sonderzeichen) ans Ende
      if (a.letter === "#") return 1;
      if (b.letter === "#") return -1;
      return a.letter.localeCompare(b.letter, "de");
    });
}

/** Gruppierte Zwischenüberschrift. */
function groupHeading(letter: string): string {
  if (letter === "#") return "Sonstige";
  return letter;
}

/**
 * Rendert den Hauptindex.
 *
 * Aufbau:
 *   ## Konzepte
 *     ### A
 *       - [[...]]
 *   ## Entitäten
 *     ### Personen
 *       - [[...]]
 *   ## Weitere
 *     - [[wiki/quellen-index|Quellenindex]] — alle Quellen
 *
 * Die Quellen sind ausgelagert: sie machten ~24 % der Datei aus (631 KB von
 * 2,7 MB), blähen den Index aber auf und werden selten durchsucht.
 */
export function renderIndexPage(kb: KnowledgeBase, today?: string): string {
  const dateStr = today ?? new Date().toISOString().slice(0, 10);
  const fm = {
    okf_version: "0.2",
    typ: "index",
    tags: ["llm-wiki/index"],
    "aktualisiert": dateStr,
    cssclasses: [],
  };

  const lines: string[] = [
    serializeFrontmatter(fm),
    "",
    "# Wissensdatenbank Index",
    "",
    "Willkommen in deiner LLM-gepflegten Wissensdatenbank. Hier findest du eine Übersicht aller erfassten Einträge.",
    "",
  ];

  // 1. Concepts — alphabetisch unterteilt
  const concepts = kb.allConcepts().filter(isQualityConcept);
  lines.push("## Konzepte", "");
  if (concepts.length === 0) {
    lines.push("Noch keine Konzepte erfasst.", "");
  } else {
    const sorted = [...concepts].sort((a, b) => a.name.localeCompare(b.name, "de"));
    for (const group of groupByInitial(sorted)) {
      lines.push(`### ${groupHeading(group.letter)}`, "");
      for (const c of group.items) {
        const def = c.definition ? ` — *${previewText(c.definition)}*` : "";
        lines.push(`- [[wiki/concepts/${c.id}|${toLinkLabel(c.name)}]]${def}`);
      }
      lines.push("");
    }
  }

  // 2. Entities grouped by type
  lines.push("## Entitäten", "");
  const entities = kb.allEntities().filter(isQualityEntity);
  if (entities.length === 0) {
    lines.push("Noch keine Entitäten erfasst.", "");
  } else {
    const grouped: Record<string, typeof entities> = {};
    for (const e of entities) {
      if (!grouped[e.type]) grouped[e.type] = [];
      grouped[e.type].push(e);
    }

    for (const type of TYPE_ORDER) {
      const list = grouped[type];
      if (!list || list.length === 0) continue;

      const groupLabel = ENTITY_TYPE_LABELS[type] ?? type;
      lines.push(`### ${groupLabel}`, "");
      const sorted = [...list].sort((a, b) => a.name.localeCompare(b.name, "de"));
      for (const e of sorted) {
        const factCount = e.facts.length;
        const sourceCount = e.sources.length;
        lines.push(`- [[wiki/entities/${e.id}|${toLinkLabel(e.name)}]] (${factCount} Fakten, ${sourceCount} Quellen)`);
      }
      lines.push("");
    }
  }

  // 3. Verweise auf den ausgelagerten Quellenindex
  const sources = kb.allSources();
  lines.push("## Weitere", "");
  if (sources.length === 0) {
    lines.push("Noch keine Quellen erfasst.", "");
  } else {
    lines.push(
      `- [[wiki/quellen-index|Quellenindex]] — ${sources.length} Quellen mit Zusammenfassung und Verknüpfungen`,
    );
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Rendert den ausgelagerten Quellenindex.
 *
 * Enthält alle Quellen, nach Verzeichnis gruppiert, damit die
 * Herkunft (Notizen/, Clippings/, Bücher/) sofort erkennbar ist.
 */
export function renderSourcesIndexPage(
  kb: KnowledgeBase,
  today?: string,
): string {
  const dateStr = today ?? new Date().toISOString().slice(0, 10);
  const fm = {
    okf_version: "0.2",
    typ: "index",
    tags: ["llm-wiki/index", "llm-wiki/quellen-index"],
    "aktualisiert": dateStr,
    cssclasses: [],
  };

  const lines: string[] = [
    serializeFrontmatter(fm),
    "",
    "# Quellenindex",
    "",
    "Alle Quellen der Wissensdatenbank, gruppiert nach Herkunft.",
    "",
  ];

  const sources = kb.allSources();
  if (sources.length === 0) {
    lines.push("Noch keine Quellen erfasst.", "");
    return lines.join("\n");
  }

  // Nach Top-Level-Ordner gruppieren
  const byFolder = new Map<string, typeof sources>();
  for (const s of sources) {
    const top = s.id.includes("/") ? s.id.split("/")[0] : "(Wurzel)";
    const list = byFolder.get(top);
    if (list) list.push(s);
    else byFolder.set(top, [s]);
  }

  const folders = [...byFolder.entries()].sort((a, b) =>
    a[0].localeCompare(b[0], "de"),
  );

  for (const [folder, list] of folders) {
    lines.push(`## ${folder}`, "");
    const sorted = [...list].sort((a, b) => a.id.localeCompare(b.id, "de"));
    for (const s of sorted) {
      const sum = s.summary ? ` — *${previewText(s.summary)}*` : "";
      lines.push(`- [[wiki/sources/${s.id}|${s.id}]]${sum}`);
    }
    lines.push("");
  }

  lines.push("---", "");
  lines.push(
    `*Seiten: [[wiki/index|Hauptindex]] · ${sources.length} Quellen*`,
  );
  lines.push("");

  return lines.join("\n");
}
