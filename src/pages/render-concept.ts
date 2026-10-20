import type { Concept } from "../core/types.js";
import { conceptFrontmatter, serializeFrontmatter } from "./frontmatter.js";
import { toLinkLabel } from "../core/link-text.js";

/**
 * @param names  ID -> Anzeigename. Wird verwendet, um den Linktext lesbar
 *               zu halten, während das Linkziel die stabile ID ist.
 */
export function renderConceptPage(
  concept: Concept,
  today?: string,
  names?: ReadonlyMap<string, string>,
): string {
  const fm = conceptFrontmatter(concept, today);
  const lines: string[] = [
    serializeFrontmatter(fm),
    "",
    `# ${concept.name}`,
    "",
  ];

  if (concept.definition) {
    lines.push(concept.definition, "");
  }

  if (concept.related.length > 0) {
    lines.push("## Verwandte Begriffe", "");
    // `related` enthält nach der Auflösung KB-IDs. Daraus lässt sich direkt
    // ein Wikilink bauen — ohne die verlustbehaftete makeId()-Umwandlung
    // eines Namens, die tote Links erzeugt hat.
    for (const r of concept.related) {
      const label = names?.get(r);
      lines.push(label ? `- [[${r}|${toLinkLabel(label)}]]` : `- [[${r}]]`);
    }
    lines.push("");
  }

  // Namen ohne passendes Ziel: als Klartext, bewusst ohne Link. Ein toter
  // Wikilink wäre schlechter als gar keiner — er markiert einen Fehler,
  // den es nicht gibt.
  const unresolved = concept.unresolvedRelated ?? [];
  if (unresolved.length > 0) {
    lines.push("## Verwandte Begriffe (ohne Eintrag)", "");
    for (const u of unresolved) {
      lines.push(`- ${toLinkLabel(u)}`);
    }
    lines.push("");
  }

  if (concept.sources.length > 0) {
    lines.push("## Quellen", "");
    for (const s of concept.sources) {
      lines.push(`- [[${s}]]`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
