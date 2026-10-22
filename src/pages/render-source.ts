import type { Concept, Entity, SourceRecord } from "../core/types.js";
import { sourceFrontmatter, serializeFrontmatter } from "./frontmatter.js";
import { toLinkLabel } from "../core/link-text.js";

export function renderSourcePage(
  source: SourceRecord,
  entities: Entity[],
  concepts: Concept[],
  /**
   * Prueft, ob fuer eine ID tatsaechlich eine Seite geschrieben wird.
   *
   * Ohne diesen Filter verlinkt die Quellseite Eintraege, die der
   * Qualitaetsfilter verworfen hat — und Eintraege, die es im KB nie
   * gab. Live gemessen: 95 tote Links auf 1.003 Quellseiten (83 auf
   * verworfene, 12 auf unbekannte Eintraege). Dieselbe Fehlerklasse wie
   * bei den Verbindungen (1.3), nur an anderer Stelle ungeprueft.
   */
  hasPage?: (id: string) => boolean,
  /** Anzeigenamen fuer Linktexte. Ohne diese Karte wird die ID angezeigt. */
  names?: ReadonlyMap<string, string>,
): string {
  const fm = sourceFrontmatter(source);
  const pageExists = hasPage ?? (() => true);
  const lines: string[] = [
    serializeFrontmatter(fm),
    "",
    `# ${source.id}`,
    "",
  ];

  if (source.summary) {
    lines.push(source.summary, "");
  }

  // Eintraege ohne eigene Seite stehen als Klartext darunter — ein toter
  // Wikilink waere schlechter als gar keiner, weil er einen Fehler
  // markiert, den es nicht gibt.
  const liveEntities: Entity[] = [];
  const deadEntities: Entity[] = [];
  for (const e of entities) {
    if (pageExists(e.id)) liveEntities.push(e);
    else deadEntities.push(e);
  }

  const liveConcepts: Concept[] = [];
  const deadConcepts: Concept[] = [];
  for (const c of concepts) {
    if (pageExists(c.id)) liveConcepts.push(c);
    else deadConcepts.push(c);
  }

  if (liveEntities.length > 0) {
    lines.push("## Entitäten", "");
    for (const e of liveEntities) {
      // Ohne Namenskarte auf den Eintragsnamen zurueckfallen — der
      // Anzeigename gehoert in den Linktext, die ID bleibt das Ziel.
      const label = names?.get(e.id) ?? e.name;
      lines.push(`- [[${e.id}|${toLinkLabel(label)}]]`);
    }
    lines.push("");
  }

  if (liveConcepts.length > 0) {
    lines.push("## Konzepte", "");
    for (const c of liveConcepts) {
      const label = names?.get(c.id) ?? c.name;
      lines.push(`- [[${c.id}|${toLinkLabel(label)}]]`);
    }
    lines.push("");
  }

  if (deadEntities.length > 0 || deadConcepts.length > 0) {
    lines.push("## Einträge (ohne Seite)", "");
    for (const e of deadEntities) {
      lines.push(`- ${toLinkLabel(names?.get(e.id) ?? e.name)}`);
    }
    for (const c of deadConcepts) {
      lines.push(`- ${toLinkLabel(names?.get(c.id) ?? c.name)}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
