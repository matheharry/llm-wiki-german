import type { RetrievedBundle } from "./types.js";

const MAX_FACTS_PER_ENTITY = 10;

function prioritizeFacts(facts: readonly string[], question?: string): string[] {
  if (facts.length <= 6 || !question) return [...facts];

  const qTokens = question
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);

  const scored = facts.map((fact, idx) => {
    const fLower = fact.toLowerCase();
    let matches = 0;
    for (const t of qTokens) {
      if (fLower.includes(t)) matches++;
    }
    return { fact, matches, idx };
  });

  // Prioritize facts with matching query terms; preserve order on ties
  scored.sort((a, b) => b.matches - a.matches || a.idx - b.idx);
  return scored.slice(0, MAX_FACTS_PER_ENTITY).map((s) => s.fact);
}

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
        const facts = prioritizeFacts(e.facts, bundle.question);
        for (const f of facts) lines.push(`- ${f}`);
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
