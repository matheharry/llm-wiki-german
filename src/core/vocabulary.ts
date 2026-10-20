import type { KnowledgeBase } from "./kb.js";

const DEFAULT_MAX = 300;
const DEFINITION_CAP = 80;

/**
 * Compact text listing of all known entities and concepts. Sent to the LLM
 * at extraction time so it normalizes against existing terms (the Karpathy
 * deduplication-at-extraction-time pattern).
 *
 * Port of `KnowledgeBase.vocabulary` in ~/tools/llm-wiki/kb.py.
 */
export function exportVocabulary(kb: KnowledgeBase, maxItems = DEFAULT_MAX): string {
  const lines: string[] = [];

  // Budget fair zwischen den beiden Namespaces aufteilen.
  //
  // Vorher: `conceptBudget = maxItems - entities.length`. Sobald es >= maxItems
  // Entitaeten gab, war das Konzept-Budget 0 — Konzepte erschienen dann NIE im
  // Prompt, egal wie viele es gab. Im Live-Wiki (4.884 Entitaeten, 5.531
  // Konzepte, maxItems 300) waren es 300 Entitaeten und 0 Konzepte. Das LLM
  // konnte also nie gegen ein bekanntes Konzept normalisieren und legte
  // stattdessen Entity-Duplikate an.
  const entityBudget = Math.floor(maxItems / 2);
  const conceptBudget = maxItems - entityBudget;

  // Zuerst die kollidierenden IDs ermitteln: sie tauchen in BEIDEN
  // Namespaces auf und der LLM muss wissen, dass es dafür nur einen
  // Namespace wählen darf.
  const entityIds = new Set(Object.keys(kb.data.entities));
  const conceptIds = new Set(Object.keys(kb.data.concepts));
  const colliding = new Set([...entityIds].filter((id) => conceptIds.has(id)));

  const entities = Object.values(kb.data.entities).slice(0, entityBudget);
  const concepts = Object.values(kb.data.concepts).slice(0, conceptBudget);

  if (entities.length > 0) {
    lines.push("=== KNOWN ENTITIES ===");
    for (const e of entities) {
      const aliases = e.aliases.length > 0 ? ` (aka ${e.aliases.join(", ")})` : "";
      const marker = colliding.has(e.id) ? " [Auch als Konzept vorhanden]" : "";
      lines.push(`- [${e.type}] ${e.name}${aliases}${marker}`);
    }
  }

  if (concepts.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push("=== KNOWN CONCEPTS ===");
    for (const c of concepts) {
      const def = (c.definition ?? "").slice(0, DEFINITION_CAP);
      const marker = colliding.has(c.id) ? " [Auch als Entität vorhanden]" : "";
      lines.push(`- ${c.name}${marker}: ${def}`);
    }
  }

  return lines.length > 0
    ? lines.join("\n")
    : "(empty — no entities or concepts yet)";
}
