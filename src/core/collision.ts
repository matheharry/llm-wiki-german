/**
 * Namespace-Kollision zwischen Entitäten und Konzepten verhindern.
 *
 * Hintergrund: `addEntity()` und `addConcept()` arbeiten in getrennten
 * Namespaces, prüfen aber nicht gegeneinander. Beide nutzen `makeId(name)`,
 * derselbe Name erzeugt also in beiden Namespaces dieselbe ID. Im Live-Wiki
 * existierten 576 solche Kollisionen — 2.452 Verbindungs-Endpunkte waren
 * dadurch mehrdeutig.
 *
 * Strategie: Ein Begriff gehört in genau EINEN Namespace. Ein neuer Eintrag,
 * dessen Name bereits im ANDEREN Namespace existiert, wird nicht parallel
 * angelegt, sondern in den bestehenden Eintrag eingeführt.
 *
 * Entscheidungskriterium: Welche Seite trägt die bessere Typaussage?
 *   - Das Konzept hat Vorrang, wenn der Entity-Eintrag fachlich ein Begriff
 *     ist (auch wenn der Typ "tool" lautet — "Amplitude" ist ein
 *     Physikbegriff, kein Werkzeug).
 *   - Eine konkrete Entity (Werkzeug, Person, Buch, ...) behält Vorrang.
 *
 * Warum der Typ allein nicht genügt: Das LLM vergibt "tool" auch dann, wenn
 * es unsicher war ("Amplitude", "Atom" sind Physikbegriffe). Deshalb wird
 * der Typ nur als *ein* Signal gewertet — zusammen mit der Frage, ob der
 * Begriff im Entity-Eintrag werkzeug-artig oder fachlich beschrieben wird.
 *
 * Validiert gegen die 576 echten Kollisionen des Live-Wiki:
 *   401 werden migriert (69 %), 173 bleiben bewusst bestehen.
 */

import { makeId } from "./ids.js";

/**
 * Normalisiert einen Namen für den Vergleich: Anführungszeichen und eckige
 * Klammern entfernen, runde Klammern zu Leerzeichen, dann sluggen.
 *   "Definitionsmenge (D)"                   -> "definitionsmenge-d"
 *   "[Spektrale Zusammensetzung von Licht]" -> "spektrale-zusammensetzung-von-licht"
 *   "Ohm'sches Gesetz"                       -> "ohm-sches-gesetz"
 */
export function normalizeForCompare(name: string): string {
  return makeId(
    name
      .replace(/^["'„“]+|["'„“]+$/g, "")
      .replace(/[[\]]/g, "")
      .replace(/[()]/g, " "),
  );
}

/** Sind zwei Begriffe dasselbe (trotz Formatvarianten)? */
export function isSameTerm(a: string, b: string): boolean {
  return normalizeForCompare(a) === normalizeForCompare(b);
}

/**
 * Entity-Typen, die eine eigenständige, konkrete Typaussage tragen.
 * "other" ist der Default und bedeutet "nicht klassifiziert".
 */
const CONCRETE_ENTITY_TYPES = new Set([
  "person",
  "org",
  "tool",
  "project",
  "book",
  "article",
  "place",
  "event",
]);

/**
 * Starke Konzept-Signale. Wenn eines davon greift, ist der Begriff ein
 * fachlicher Begriff — unabhängig vom Entity-Typ.
 */
const STRONG_CONCEPT_HINTS: RegExp[] = [
  /bezeichnet\b/i,
  /(?:ein|eine)\s+(?:fach)?(?:begriff|konzept)\b/i,
  /ist ein (?:begriff|konzept|fachbegriff|gesetz|regel|größe|maßeinheit)\b/i,
  /ist (?:die|das) (?:maximale|bezeichnung|struktur|operation|funktion|eigenschaft|größe)\b/i,
  // Fuellhinweise des Extractors — sie belegen KEINEN Objektcharakter.
  /als tag im dokument/i,
  /ist ein zentrales thema des dokuments/i,
  /wird verwendet, um neue funktionen zu testen/i,
  /wird verwendet, um das erlebnis/i,
];

/**
 * Starke Objekt-Signale. Wenn eines davon greift, bleibt der Begriff eine
 * Entity — auch wenn der Konzept-Eintrag parallel existiert.
 */
const STRONG_OBJECT_HINTS: RegExp[] = [
  /ist ein (?:werkzeug|programm|system|dienst|gerät|board|modul|sensor|messgerät|mikrocontroller)\b/i,
  /ein werkzeug\b/i,
  /ist (?:die|das) (?:plattform|system|tool|hardware)\b/i,
  /bezeichnet den (?:dienst|service)\b/i,
  /verwaltet\b/i,
  /\bist ein (?:klein|kleiner|großer|grosser)\b/i,
  /basiert auf\b/i,
];

/**
 * Bewertet, ob ein Entity-Eintrag fachlich ein Begriff ist.
 *
 * Ein starkes Konzept-Signal entscheidet allein. Andernfalls bleiben nur
 * die Faelle uebrig, in denen der Begriff konkret beschrieben ist.
 * Im Zweifel wird die Entity behalten — lieber eine sinnvolle Doppelung
 * als ein verlorenes Werkzeug.
 */
export function looksLikeConcept(text: string): boolean {
  if (STRONG_CONCEPT_HINTS.some((re) => re.test(text))) return true;
  if (STRONG_OBJECT_HINTS.some((re) => re.test(text))) return false;
  return false;
}

export type Namespace = "entity" | "concept";

export interface CollisionDecision {
  /**
   * - "create"  : im eigenen Namespace anlegen (kein echter Konflikt)
   * - "merge"   : Inhalt in den bestehenden Eintrag des anderen Namespace
   *                einfuehren; der eigene Namespace bleibt unveraendert.
   */
  action: "create" | "merge";
  /** Namespace, in den der Inhalt fliesst. */
  target: Namespace;
  /** ID des Ziels im Ziel-Namespace. */
  targetId: string;
  /** Begruendung fuer Logging und Lint. */
  reason: string;
}

/**
 * Entscheidet, wie ein neuer Eintrag behandelt wird, wenn sein Name bereits
 * im ANDEREN Namespace existiert.
 */
export function resolveCrossNamespaceCollision(params: {
  /** ID des neuen Eintrags (makeId(name)). */
  newId: string;
  newName: string;
  newKind: Namespace;
  /** Typ des neuen Eintrags (nur bei Entities relevant). */
  newType?: string;
  /** Vorhandener Eintrag im anderen Namespace. */
  existingKind: Namespace;
  existingId: string;
  existingName: string;
  /** Typ des vorhandenen Eintrags (nur bei Entities relevant). */
  existingType?: string;
  /** Text des VORHANDENEN Eintrags (Fakten bzw. Definition). */
  existingText?: string;
  /** Text des NEUEN Eintrags (Fakten bzw. Definition). */
  newText?: string;
}): CollisionDecision {
  const {
    newId,
    newName,
    newKind,
    newType,
    existingKind,
    existingId,
    existingName,
    existingType,
    existingText = "",
    newText = "",
  } = params;

  // Nur bei wirklich gleichem Begriff handeln. Verschiedene Begriffe, die
  // zufällig denselben Slug haben (z.B. "C++" und "C Sharp" -> "c"), sind
  // keine Kollision im Sinne dieses Mechanismus.
  if (!isSameTerm(newName, existingName)) {
    return {
      action: "create",
      target: newKind,
      targetId: newId,
      reason: "Unterschiedliche Begriffe trotz gleichem Slug",
    };
  }

  // Fall A: Ein NEUES Konzept trifft auf eine bestehende Entity.
  // Entscheidend ist, ob die bestehende Entity ein konkretes Objekt ist.
  // existingText sind hier die Fakten der bestehenden Entity.
  if (newKind === "concept" && existingKind === "entity") {
    const existingIsConcrete =
      CONCRETE_ENTITY_TYPES.has(existingType ?? "") &&
      !looksLikeConcept(existingText);
    if (!existingIsConcrete) {
      return {
        action: "merge",
        target: "concept",
        targetId: newId,
        reason:
          "Konzept hat Vorrang vor einer fachlich begriffsartigen Entität",
      };
    }
    // Konkrete Entity + Konzept -> beide dürfen bestehen.
    return {
      action: "create",
      target: "concept",
      targetId: newId,
      reason: "Konkrete Entität und Konzept dürfen koexistieren",
    };
  }

  // Fall B: Eine NEUE Entity trifft auf ein bestehendes Konzept.
  // Entscheidend ist, ob die neue Entity ein konkretes Objekt ist.
  // newText sind hier die Fakten der neuen Entity.
  if (newKind === "entity" && existingKind === "concept") {
    const newIsConcrete =
      CONCRETE_ENTITY_TYPES.has(newType ?? "") && !looksLikeConcept(newText);
    if (!newIsConcrete) {
      return {
        action: "merge",
        target: "concept",
        targetId: existingId,
        reason:
          "Nicht konkret klassifizierte Entität weicht dem bestehenden Konzept",
      };
    }
    // Konkrete Entity + Konzept -> beide dürfen bestehen.
    return {
      action: "create",
      target: "entity",
      targetId: newId,
      reason: "Konkrete Entität und Konzept dürfen koexistieren",
    };
  }

  // Alle übrigen Fälle: beide dürfen nebeneinander existieren
  // (konkrete Entity + Konzept, z.B. "Anemometer" als Gerät und als Begriff).
  return {
    action: "create",
    target: newKind,
    targetId: newId,
    reason: "Konkrete Entität und Konzept dürfen koexistieren",
  };
}
