/**
 * Filter für Verbindungen (`connections`).
 *
 * Hintergrund: `addConnection()` legt Verbindungen an, ohne zu prüfen, ob
 * es für das Ziel (und für die Quelle) überhaupt eine Seite gibt. Im
 * Live-Wiki zeigten 760 der 10.232 gerenderten Verbindungs-Links auf
 * Seiten, die nie geschrieben werden.
 *
 * Wichtig: Der Filter arbeitet **pro Link-Ende**, nicht pro Verbindung.
 * Eine Verbindung (X → Y), für die Y keine Seite hat, erzeugt auf der
 * Seite von X genau einen toten Link. Die andere Richtung (auf der Seite
 * von Y) kann völlig in Ordnung sein. Würde man die ganze Verbindung
 * verwerfen, ginge die Information "X steht in Beziehung zu Y" verloren.
 *
 * Aus den Daten: 112 Verbindungen haben beide Enden ohne Seite — die
 * ganze Verbindung zu verwerfen entfernt aber nur 112 der 760 toten
 * Links.
 */

import type { Connection } from "./types.js";

/**
 * Ein gerenderter Verbindungs-Link: die Quelle, das Ziel und der Typ.
 * Das Ziel kann "ausgehend" (Link von `from` nach `to`) oder
 * "eingehend" (Link von `to` nach `from`) gerendert werden.
 */
export interface ConnectionLink {
  /** Die andere Seite der Verbindung (das Linkziel). */
  target: string;
  /** Verbindungstyp. */
  type: string;
  /** Richtung: vom Startpunkt aus gesehen. */
  direction: "outgoing" | "incoming";
  /** Die vollständige Verbindung. */
  connection: Connection;
}

/**
 * Teilt die Verbindungen einer Seite in Links auf, deren Ziel tatsächlich
 * existiert, und solche, die ins Leere zeigen.
 *
 * @param connections  alle Verbindungen, die die Seite betreffen
 * @param pageId       die ID der Seite, die gerendert wird
 * @param hasPage      prüft, ob eine ID zu einer geschriebenen Seite gehört
 */
export function filterConnectionLinks(
  connections: readonly Connection[],
  pageId: string,
  hasPage: (id: string) => boolean,
): {
  links: ConnectionLink[];
  deadLinks: ConnectionLink[];
} {
  const links: ConnectionLink[] = [];
  const deadLinks: ConnectionLink[] = [];

  for (const connection of connections) {
    if (connection.from === pageId) {
      // Ausgehend: Linkziel ist `to`.
      const link: ConnectionLink = {
        target: connection.to,
        type: connection.type,
        direction: "outgoing",
        connection,
      };
      (hasPage(connection.to) ? links : deadLinks).push(link);
    } else if (connection.to === pageId) {
      // Eingehend: Linkziel ist `from`.
      const link: ConnectionLink = {
        target: connection.from,
        type: connection.type,
        direction: "incoming",
        connection,
      };
      (hasPage(connection.from) ? links : deadLinks).push(link);
    }
  }

  return { links, deadLinks };
}

/**
 * Filtert Verbindungen so, dass nur solche mit existierendem Ziel
 * zurückbleiben.
 *
 * Für Fälle, wo die Richtung keine Rolle spielt (z.B. eine Übersicht
 * aller Verbindungen).
 */
export function filterConnections(
  connections: readonly Connection[],
  hasPage: (id: string) => boolean,
): { kept: Connection[]; dropped: Connection[] } {
  const kept: Connection[] = [];
  const dropped: Connection[] = [];
  for (const connection of connections) {
    if (hasPage(connection.to)) kept.push(connection);
    else dropped.push(connection);
  }
  return { kept, dropped };
}
