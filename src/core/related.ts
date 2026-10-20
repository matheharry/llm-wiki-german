/**
 * Auflösung von `related`-Namen gegen die bekannten KB-IDs.
 *
 * Hintergrund: `related` speichert freie Textnamen ("Generative KI",
 * "Bezugspunkt (Datum)"). Beim Rendern wurden sie per `makeId()` in einen
 * Slug umgewandelt, um daraus einen Wikilink zu bauen. `makeId()` ist
 * dabei verlustbehaftet: es entfernt alle Zeichen außer Buchstaben, Ziffern,
 * Leerzeichen und Bindestrichen.
 *
 * Im Live-Wiki führten 2.803 von 11.176 related-Verweisen ins Leere:
 *   - 2.651 Verweise zeigten auf Einträge, die es im KB nie gab
 *     (der LLM nennt Begriffe, die nie zu einem eigenen Eintrag wurden).
 *   - 151 Verweise zeigten auf Einträge, die es gab, deren Seite aber der
 *     Qualitätsfilter verworfen hatte.
 *   - nur 1 Verweis war ein reiner makeId()-Verlust.
 *
 * Die Render-Seite allein kann das nicht lösen: sie kennt nur die Seite, die
 * sie gerade schreibt. Die Auflösung muss passieren, wo der KB vollständig
 * ist — beim Merge.
 *
 * Strategie:
 *   1. Beim Merge wird jeder `related`-Name gegen die bekannten IDs
 *      aufgelöst. Der Name wird zur ID, wenn es ein Ziel gibt.
 *   2. Namen ohne Ziel wandern nach `unresolvedRelated` und werden dort
 *      als Klartext geführt (kein Link).
 *   3. Beim Rendern werden nur noch aufgelöste Verweise verlinkt.
 *
 * Das ist rückwärtskompatibel: alte KBs ohne `unresolvedRelated` haben
 * dort `undefined`, was wie eine leere Liste behandelt wird.
 */

import { makeId } from "./ids.js";

export interface ResolvedRelated {
  /** Aufgelöste Verweise: KB-IDs, für die es tatsächlich eine Seite gibt. */
  resolved: string[];
  /** Namen ohne passendes Ziel — bleiben Klartext, kein Link. */
  unresolved: string[];
}

/**
 * Normalisiert einen Namen für den Vergleich mit KB-Namen.
 * Bewusst großzügiger als `makeId()`: es werden nur Leerzeichen/Zeichen
 * vereinheitlicht, nicht Zeichen entfernt. Dadurch findet
 * "Magic_8_ball Logic/Implementation" den Eintrag "Magic 8 Ball
 * Logic/Implementation".
 */
export function normalizeRelatedName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFC")
    .replace(/[\s_]+/g, " ")
    .replace(/[、,]/g, ",")
    .replace(/\s*([/,])\s*/g, "$1");
}

/**
 * Baut einen Index, über den ein `related`-Name auf eine KB-ID aufgelöst
 * werden kann.
 *
 * Mehrere Strategien in dieser Reihenfolge:
 *   1. Exakte ID (der Name ist bereits eine ID).
 *   2. Normalisierter Name (Schreibweise mit Unterstrichen, Groß-/Kleinschreibung).
 *   3. `makeId()` des Namens (sluggleiche Schreibweise).
 */
export function buildRelatedIndex(
  entries: ReadonlyArray<{ id: string; name: string }>,
): Map<string, string> {
  const index = new Map<string, string>();

  const add = (key: string, id: string): void => {
    if (!key) return;
    // Der erste Treffer gewinnt — die KB-Reihenfolge ist stabil, damit die
    // Auflösung reproduzierbar bleibt.
    if (!index.has(key)) index.set(key, id);
  };

  for (const entry of entries) {
    add(entry.id.toLowerCase(), entry.id);
    add(normalizeRelatedName(entry.name), entry.id);
    add(makeId(entry.name), entry.id);
  }
  return index;
}

/**
 * Löst einen einzelnen `related`-Namen auf.
 *
 * @param name        der Name aus dem KB
 * @param index       der Index aus `buildRelatedIndex`
 * @returns die KB-ID oder undefined, wenn nichts passt
 */
export function resolveRelatedName(
  name: string,
  index: ReadonlyMap<string, string>,
): string | undefined {
  const trimmed = name.trim();
  if (!trimmed) return undefined;

  return (
    index.get(trimmed.toLowerCase()) ??
    index.get(normalizeRelatedName(trimmed)) ??
    index.get(makeId(trimmed))
  );
}

/**
 * Löst eine Liste von `related`-Namen auf.
 *
 * Reihenfolge im Ergebnis: aufgelöste IDs in der Reihenfolge des Eingangs,
 * danach die unaufgelösten Namen (ohne Duplikate).
 */
export function resolveRelated(
  names: readonly string[],
  index: ReadonlyMap<string, string>,
): ResolvedRelated {
  const resolved: string[] = [];
  const unresolved: string[] = [];
  const seenResolved = new Set<string>();
  const seenUnresolved = new Set<string>();

  for (const raw of names) {
    if (typeof raw !== "string") continue;
    const name = raw.trim();
    if (!name) continue;

    const id = resolveRelatedName(name, index);
    if (id) {
      if (!seenResolved.has(id)) {
        seenResolved.add(id);
        resolved.push(id);
      }
    } else if (!seenUnresolved.has(name)) {
      seenUnresolved.add(name);
      unresolved.push(name);
    }
  }

  return { resolved, unresolved };
}
