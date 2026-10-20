import type { Connection, Entity } from "../core/types.js";
import { entityFrontmatter, serializeFrontmatter } from "./frontmatter.js";
import { filterConnectionLinks } from "../core/connection-filter.js";
import { toLinkLabel } from "../core/link-text.js";

const CONNECTION_TYPE_LABELS: Record<string, string> = {
  influences: "beeinflusst",
  uses: "verwendet",
  critiques: "kritisiert",
  extends: "erweitert",
  "part-of": "Teil von",
  "created-by": "erstellt von",
  "related-to": "verknüpft mit",
  "applies-to": "bezieht sich auf",
  "contrasts-with": "steht im Kontrast zu",
};

export function renderEntityPage(
  entity: Entity,
  connections: Connection[],
  today?: string,
  /**
   * Prüft, ob für eine ID tatsächlich eine Seite geschrieben wird.
   * Verbindungen, deren Ziel keine Seite hat, erzeugen sonst einen toten
   * Wikilink.
   */
  hasPage?: (id: string) => boolean,
  /**
   * Anzeigenamen für Linktexte. Ohne diese Karte wird die ID angezeigt.
   */
  names?: ReadonlyMap<string, string>,
): string {
  const fm = entityFrontmatter(entity, today);
  const pageExists = hasPage ?? (() => true);

  // Der Filter arbeitet pro Link-Ende: eine Verbindung (X → Y) ohne
  // Y-Seite erzeugt auf der X-Seite einen toten Link, auf der Y-Seite
  // aber einen völlig gültigen.
  const { links, deadLinks } = filterConnectionLinks(
    connections,
    entity.id,
    pageExists,
  );

  const lines: string[] = [serializeFrontmatter(fm), "", `# ${entity.name}`, ""];

  if (entity.facts.length > 0) {
    lines.push("## Fakten", "");
    for (const f of entity.facts) {
      lines.push(`- ${f}`);
    }
    lines.push("");
  }

  if (links.length > 0) {
    lines.push("## Verbindungen", "");
    for (const link of links) {
      const typeLabel = CONNECTION_TYPE_LABELS[link.type] ?? link.type;
      const label = names?.get(link.target);
      const target = label
        ? `[[${link.target}|${toLinkLabel(label)}]]`
        : `[[${link.target}]]`;
      lines.push(`- ${target} *(${typeLabel})*`);
    }
    lines.push("");
  }

  // Verbindungen, deren Ziel keine Seite hat, erscheinen als Klartext.
  // Ein toter Wikilink wäre schlechter als gar keiner.
  if (deadLinks.length > 0) {
    lines.push("## Verbindungen (ohne Eintrag)", "");
    for (const link of deadLinks) {
      const typeLabel = CONNECTION_TYPE_LABELS[link.type] ?? link.type;
      const label = names?.get(link.target) ?? link.target;
      lines.push(`- ${toLinkLabel(label)} *(${typeLabel})*`);
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
