import type { KnowledgeBase } from "../core/kb.js";
import { isQualityEntity, isQualityConcept } from "../core/filters.js";
import { serializeFrontmatter } from "./frontmatter.js";

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

export function renderIndexPage(kb: KnowledgeBase, today?: string): string {
  const dateStr = today ?? new Date().toISOString().slice(0, 10);
  const fm = {
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

  // 1. Concepts
  const concepts = kb.allConcepts().filter(isQualityConcept);
  lines.push("## Konzepte", "");
  if (concepts.length === 0) {
    lines.push("Noch keine Konzepte erfasst.", "");
  } else {
    for (const c of concepts.sort((a, b) => a.name.localeCompare(b.name))) {
      const def = c.definition ? ` — *${c.definition}*` : "";
      lines.push(`- [[wiki/concepts/${c.id}|${c.name}]]${def}`);
    }
    lines.push("");
  }

  // 2. Entities grouped by type
  lines.push("## Entitäten", "");
  const entities = kb.allEntities().filter(isQualityEntity);
  if (entities.length === 0) {
    lines.push("Noch keine Entitäten erfasst.", "");
  } else {
    // Group entities by type
    const grouped: Record<string, typeof entities> = {};
    for (const e of entities) {
      if (!grouped[e.type]) grouped[e.type] = [];
      grouped[e.type].push(e);
    }

    const typeOrder = ["person", "org", "project", "tool", "book", "article", "place", "event", "other"];
    for (const type of typeOrder) {
      const list = grouped[type];
      if (!list || list.length === 0) continue;

      const groupLabel = ENTITY_TYPE_LABELS[type] ?? type;
      lines.push(`### ${groupLabel}`, "");
      for (const e of list.sort((a, b) => a.name.localeCompare(b.name))) {
        const factCount = e.facts.length;
        const sourceCount = e.sources.length;
        lines.push(`- [[wiki/entities/${e.id}|${e.name}]] (${factCount} Fakten, ${sourceCount} Quellen)`);
      }
      lines.push("");
    }
  }

  // 3. Sources
  const sources = kb.allSources();
  lines.push("## Quellen", "");
  if (sources.length === 0) {
    lines.push("Noch keine Quellen erfasst.", "");
  } else {
    for (const s of sources.sort((a, b) => a.id.localeCompare(b.id))) {
      const sum = s.summary ? ` — *${s.summary}*` : "";
      lines.push(`- [[wiki/sources/${s.id}|${s.id}]]${sum}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
