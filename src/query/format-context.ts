import type { RetrievedBundle } from "./types.js";

const MAX_FACTS_PER_ENTITY = 10;

/**
 * Punkt 2: Budget pro Abschnitt.
 *
 * Frueher gab es nur eine globale Grenze (`MAX_CONTEXT_CHARS = 16_000`
 * in `prompts.ts`), die den Kontext am ENDE abschnitt. Die Reihenfolge
 * war ENTITAETEN -> KONZEPTE -> VERBINDUNGEN -> QUELLDATEIEN, also
 * fraess der erste Abschnitt das Budget allein.
 *
 * Gemessen an der Live-KB, Frage "Welche Werkzeuge nutzt Harald March
 * im Unterricht?": 408 kB Kontext, davon 16 kB im Prompt. Sichtbar
 * waren 8 Entities — die 5 Konzepte, 20 Verbindungen und 659 Quellen
 * wurden kommentarlos weggeschnitten. Der Kontext, den das LLM bekam,
 * war damit ein Bruchteil des gesuchten Materials.
 *
 * Jetzt bekommt jeder Abschnitt ein eigenes Budget. Was nicht passt,
 * wird innerhalb des Abschnitts gekuerzt — nicht durch Weglassen des
 * ganzen Abschnitts.
 */
export interface ContextBudget {
  entities: number;
  concepts: number;
  connections: number;
  sources: number;
}

/**
 * Standard-Budget in Zeichen, summiert auf 16.000 — dem bisherigen
 * globalen Limit. Die Verteilung ist gewichtet: Konzepte tragen
 * Definitionen (das eigentliche Wissen), Verbindungen zeigen
 * Zusammenhaenge, Quellen sind Belege.
 */
export const DEFAULT_CONTEXT_BUDGET: ContextBudget = {
  entities: 6_000,
  concepts: 4_000,
  connections: 2_000,
  sources: 4_000,
};

/** Loest eine KB-ID zu einem lesbaren Namen auf. */
function labelFor(
  id: string,
  nameById: ReadonlyMap<string, string> | undefined,
  fallback: string,
): string {
  if (!id) return fallback;
  return nameById?.get(id) ?? fallback;
}

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

/**
 * Quellenpfade auf den Dateinamen kuerzen.
 *
 * Die vollstaendigen Pfade sind der groesste Ballast: "Notizen/Schule/
 * Mathematik/Schulstufe 6/Vierecke und Vielecke.md" kostet 60 Zeichen
 * und traegt keine Information, die das LLM braucht. Der Dateiname
 * genuegt.
 */
function shortSource(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

/**
 * Baut den Abschnitt fuer eine Liste von Eintraegen und kuerzt auf das
 * Budget. Der Kuerzungsvermerk nennt, wieviel entfiel — das LLM
 * soll wissen, dass die Liste unvollstaendig ist.
 */
function section(
  heading: string,
  budget: number,
  render: () => string[],
): string[] {
  const lines = render();
  if (lines.length === 0) return [];
  const head = `## ${heading}`;
  const body = lines.join("\n");
  const used = head.length + 1 + body.length;
  if (used <= budget) return [head, body, ""];
  // Kuerzen: so viel passt, plus Vermerk.
  const room = Math.max(0, budget - head.length - 1);
  let cut = body.slice(0, room);
  const lastNl = cut.lastIndexOf("\n");
  if (lastNl > 0) cut = cut.slice(0, lastNl);
  return [
    head,
    cut,
    `[... ${heading} gekürzt ...]`,
    "",
  ];
}

export function formatContextMarkdown(
  bundle: RetrievedBundle,
  budget: ContextBudget = DEFAULT_CONTEXT_BUDGET,
): string {
  const lines: string[] = [];
  const nameById = bundle.nameById;

  lines.push(
    ...section("ENTITÄTEN", budget.entities, () => {
      const out: string[] = [];
      for (const e of bundle.entities) {
        out.push(`### ${e.name} [${e.type}]`);
        if (e.aliases.length > 0) {
          out.push(`Andere Namen: ${e.aliases.join(", ")}`);
        }
        if (e.facts.length > 0) {
          out.push("Fakten:");
          const facts = prioritizeFacts(e.facts, bundle.question);
          for (const f of facts) out.push(`- ${f}`);
        }
        if (e.sources.length > 0) {
          out.push(`Quellen: ${e.sources.map(shortSource).join(", ")}`);
        }
        out.push("");
      }
      return out;
    }),
  );

  lines.push(
    ...section("KONZEPTE", budget.concepts, () => {
      const out: string[] = [];
      for (const c of bundle.concepts) {
        out.push(`### ${c.name}`);
        if (c.definition) out.push(c.definition);
        if (c.related && c.related.length > 0) {
          const related = Array.isArray(c.related) ? c.related : [c.related];
          // Punkt 1b: IDs -> lesbare Namen.
          const labels = related.map((r) => labelFor(r, nameById, r));
          out.push(`Verwandt mit: ${labels.join(", ")}`);
        }
        if (c.sources.length > 0) {
          out.push(`Quellen: ${c.sources.map(shortSource).join(", ")}`);
        }
        out.push("");
      }
      return out;
    }),
  );

  lines.push(
    ...section("VERBINDUNGEN", budget.connections, () => {
      const out: string[] = [];
      for (const c of bundle.connections) {
        // Punkt 1b: Endpunkte sind IDs -> Namen zeigen.
        const from = labelFor(c.from, nameById, c.from);
        const to = labelFor(c.to, nameById, c.to);
        out.push(`- ${from} → ${to} (${c.type}): ${c.description}`);
      }
      return out;
    }),
  );

  lines.push(
    ...section("QUELLDATEIEN", budget.sources, () => {
      const out: string[] = [];
      for (const s of bundle.sources) {
        out.push(`- ${s.id} — ${s.summary}`);
      }
      return out;
    }),
  );

  return lines.join("\n");
}
