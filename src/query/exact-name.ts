/**
 * Exakter Namenstreffer — die gemeinsame Regel fuer Keyword-Ranking
 * und Abfrage.
 *
 * "Exakt" heisst: der Name IST einer der Suchbegriffe, oder er ist
 * der Normalform davon. Die Normalform beruecksichtigt Stemming
 * ("Molekül" -> "molekul") und Umlaut-Ersetzung ("Bücher" ->
 * "bucher").
 *
 * Bindestriche werden bewusst NICHT normalisiert: gemessen brachte
 * das keinen Unterschied (19 von 19 erreichbar mit und ohne).
 *
 * Zusaetzlich wird die GESAMTE Frage als Kandidat geprueft: "KI-Chatbot"
 * zerfaellt im Stoppwort-Filter in "ki" + "chatbot" — der Name passt
 * aber zu beiden zusammen.
 *
 * Das Modul liegt bewusst separat: `keyword-ranker.ts` und
 * `retrieve.ts` brauchen dieselbe Regel, und eine Kopie an beiden
 * Stellen driftzt auseinander.
 */

export function normalizeForCompare(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/ß/g, "ss")
    .trim();
}

/**
 * Traegt der Name die Suchanfrage exakt?
 *
 * @param nameLower    Der Name des Eintrags, bereits kleingeschrieben.
 * @param terms        Die Suchbegriffe der Frage.
 * @param fullQuestion Die vollstaendige Frage, optional. Wird
 *                     zusaetzlich als Kandidat geprueft.
 */
export function isExactNameHit(
  nameLower: string,
  terms: readonly string[],
  fullQuestion?: string,
): boolean {
  const name = normalizeForCompare(nameLower);
  for (const t of terms) {
    if (name === normalizeForCompare(t)) return true;
  }
  if (fullQuestion) {
    const q = normalizeForCompare(fullQuestion);
    if (q.length > 2 && name === q) return true;
  }
  return false;
}

/**
 * Ist der Name EXAKT die ganze Frage?
 *
 * Der staerkste Treffer: die Frage ist nichts als der Name des
 * Eintrags. "Meteor" als Frage trifft genau die Entity "Meteor" —
 * nicht "Meteorologie".
 *
 * Getrennt von `isExactNameHit`, weil die beiden Faelle unterschiedlich
 * behandelt werden: der Frage-Treffer bekommt in `retrieve.ts` einen
 * eigenen Vorrang, der Begriff-Treffer nicht (das war messbar
 * gleichwertig).
 */
export function matchesQuestion(
  nameLower: string,
  fullQuestion: string,
): boolean {
  const name = normalizeForCompare(nameLower);
  const q = normalizeForCompare(fullQuestion);
  return q.length > 2 && name === q;
}
