import type { Connection, Entity } from "../core/types.js";
import { entityFrontmatter, serializeFrontmatter } from "./frontmatter.js";

const ENTITY_TYPE_LABELS: Record<string, string> = {
  person: "Person",
  org: "Organisation",
  tool: "Werkzeug",
  project: "Projekt",
  book: "Buch",
  article: "Artikel",
  place: "Ort",
  event: "Ereignis",
  other: "Sonstiges",
};

export function renderEntityPage(
  entity: Entity,
  connections: Connection[],
  today?: string,
): string {
  const fm = entityFrontmatter(entity, today);
  const outgoing = connections.filter((c) => c.from === entity.id);
  const incoming = connections.filter((c) => c.to === entity.id);

  const lines: string[] = [serializeFrontmatter(fm), "", `# ${entity.name}`, ""];

  if (entity.facts.length > 0) {
    lines.push("## Fakten", "");
    for (const f of entity.facts) {
      lines.push(`- ${f}`);
    }
    lines.push("");
  }

  if (outgoing.length > 0 || incoming.length > 0) {
    lines.push("## Verbindungen", "");
    for (const c of outgoing) {
      const typeLabel = ENTITY_TYPE_LABELS[c.type] ?? c.type;
      lines.push(`- [[${c.to}]] *(${typeLabel})*`);
    }
    for (const c of incoming) {
      const typeLabel = ENTITY_TYPE_LABELS[c.type] ?? c.type;
      lines.push(`- [[${c.from}]] *(${typeLabel})*`);
    }
    lines.push("");
  }

  if (entity.sources.length > 0) {
    lines.push("## Quellen", "");
    for (const s of entity.sources) {
      lines.push(`- [[${s}]]`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
