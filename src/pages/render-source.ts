import type { Concept, Entity, SourceRecord } from "../core/types.js";
import { sourceFrontmatter, serializeFrontmatter } from "./frontmatter.js";

export function renderSourcePage(
  source: SourceRecord,
  entities: Entity[],
  concepts: Concept[],
): string {
  const fm = sourceFrontmatter(source);
  const lines: string[] = [
    serializeFrontmatter(fm),
    "",
    `# ${source.id}`,
    "",
  ];

  if (source.summary) {
    lines.push(source.summary, "");
  }

  if (entities.length > 0) {
    lines.push("## Entitäten", "");
    for (const e of entities) {
      lines.push(`- [[${e.id}|${e.name}]]`);
    }
    lines.push("");
  }

  if (concepts.length > 0) {
    lines.push("## Konzepte", "");
    for (const c of concepts) {
      lines.push(`- [[${c.id}|${c.name}]]`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
