/**
 * Escaping von Linktexten in Obsidian-Wikilinks.
 *
 * Hintergrund: Der LLM liefert gelegentlich einen Namen, der bereits wie
 * ein Wikilink formatiert ist — im Live-Wiki stand als Entity-Name
 * wörtlich "[[Breezedeus]]". Wird dieser Name als Linktext verwendet,
 * entsteht `[[breezedeus|[[Breezedeus]]]]` — kaputter Link, und der
 * eigentliche Name geht verloren.
 *
 * Zusätzlich enthalten Namen gelegentlich ein `|` (z.B. "Lösung (Zahlenpaar
 * (x|y))"). Auch das bricht die Wikilink-Syntax, weil `|` das Ziel vom
 * Anzeigenamen trennt.
 */

/**
 * Entfernt eine vorhandene Wikilink-Verpackung aus einem Text.
 *   "[[Breezedeus]]"  -> "Breezedeus"
 *   "[[Ziel|Anzeige]]" -> "Anzeige"
 */
export function unwrapWikilink(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^\[\[([^\]]+)\]\]$/);
  if (!match) return trimmed;
  const inner = match[1];
  const pipe = inner.indexOf("|");
  return (pipe >= 0 ? inner.slice(pipe + 1) : inner).trim();
}

/**
 * Maskiert ein `|` im Linktext, damit die Wikilink-Syntax intakt bleibt.
 *
 * In Obsidian wird ein senkrechter Strich im Anzeigenamen mit `\|`
 * escaped. Ohne dieses Escaping zerbricht `[[ziel|Anzeige]]` in
 * `[[ziel|Anzeige]]` -> `[[ziel|Anzeige]]` mit falschem Ziel.
 */
export function escapeLinkLabel(text: string): string {
  return text.replace(/\|/g, "\\|");
}

/**
 * Bereitet einen Namen für die Verwendung als Wikilink-Anzeigename vor:
 * vorhandene Wikilink-Verpackung entfernen, `|` maskieren.
 */
export function toLinkLabel(name: string): string {
  return escapeLinkLabel(unwrapWikilink(name));
}
