import type { RetrievedBundle } from "./types.js";

export function formatContextMarkdown(bundle: RetrievedBundle): string {
  const lines: string[] = [];

  if (bundle.entities.length > 0) {
    lines.push("## ENTITÄTEN");
    for (const e of bundle.entities) {
      lines.push(`### ${e.name} [${e.type}]`);
      if (e.aliases.length > 0) {
        lines.push(`Andere Namen: ${e.aliases.join(", ")}`);
      }
      if (e.facts.length > 0) {
        lines.push("Fakten:");
        for (const f of e.facts) lines.push(`- ${f}`);
      }
      if (e.sources.length > 0) {
        lines.push(`Quellen: ${e.sources.join(", ")}`);
      }
      lines.push("");
    }
  }

  if (bundle.concepts.length > 0) {
    lines.push("## KONZEPTE");
    for (const c of bundle.concepts) {
      lines.push(`### ${c.name}`);
      if (c.definition) lines.push(c.definition);
      if (c.related && c.related.length > 0) {
        const related = Array.isArray(c.related) ? c.related : [c.related];
        lines.push(`Verwandt mit: ${related.join(", ")}`);
      }
      if (c.sources.length > 0) {
        lines.push(`Quellen: ${c.sources.join(", ")}`);
      }
      lines.push("");
    }
  }

  if (bundle.connections.length > 0) {
    lines.push("## VERBINDUNGEN");
    for (const c of bundle.connections) {
      lines.push(`- ${c.from} → ${c.to} (${c.type}): ${c.description}`);
    }
    lines.push("");
  }

  if (bundle.sources.length > 0) {
    lines.push("## QUELLDATEIEN");
    for (const s of bundle.sources) {
      lines.push(`- ${s.id} — ${s.summary}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
