/**
 * YAML-Sicherheit von `serializeFrontmatter` / `yamlScalar`
 * (src/pages/frontmatter.ts).
 *
 * Testet die ECHTE Plugin-Funktion, nicht eine Kopie: der Test schlaegt fehl,
 * wenn die Serialisierung ungueltiges YAML erzeugt oder den Wert veraendert.
 *
 * Hintergrund: In der Live-Wiki hatten 43 Seiten ungueltiges Frontmatter
 * ("sequence entries are not allowed here", "unacceptable character #x0008",
 * "while scanning a simple key"). Ursache war yamlScalar() in
 * src/pages/frontmatter.ts: Es quotete nur bei YAML-Sonderzeichen, escapte
 * Backslashes aber nur im Quoting-Zweig und kannte YAML-Schluesselwoerter nicht.
 */
import { describe, it, expect } from "vitest";
import * as yaml from "yaml";
import { serializeFrontmatter, entityFrontmatter } from "../../src/pages/frontmatter.js";
import type { Entity } from "../../src/core/types.js";

/** Saniert einen Wert so, wie es yamlScalar tun soll. */
function expectedValue(v: string): string {
  return v
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "")
    .replace(/\r/g, " ")
    .replace(/\n/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/**
 * Serialisiert ein Feld ueber die echte Plugin-Funktion und liest es zurueck.
 * serializeFrontmatter liefert einen Block mit beiden "---"-Delimitern —
 * YAML sieht damit zwei Dokumente, also das erste nehmen.
 */
function roundTrip(field: string, value: string): unknown {
  const text = serializeFrontmatter({ [field]: value });
  const docs = yaml.parseAllDocuments(text).map((d) => d.toJS()) as Record<string, unknown>[];
  return docs[0]?.[field];
}

describe("yamlScalar — fuehrender YAML-Indikator", () => {
  it("parst eine Description mit fuehrendem '- ' als String", () => {
    const v = "- Ist Mitautor von Studien.";
    expect(roundTrip("description", v)).toBe(v);
  });

  it("behaelt fuehrende Indikatoren wie '#' und '?' erhalten", () => {
    for (const v of ["# Lernziel", "? Frage", "a: b", "x, y"]) {
      expect(roundTrip("description", v)).toBe(v);
    }
  });
});

describe("yamlScalar — Backslash (LaTeX)", () => {
  it("behaelt \\rho, \\alpha, \\eta, \\cdot unveraendert", () => {
    for (const v of [
      "Dichte ($\\rho$)",
      "$\\alpha$",
      "$\\eta$",
      "$\\cdot V$",
      "$\\bar{x}$",
    ]) {
      expect(roundTrip("description", v)).toBe(v);
    }
  });

  it("erzeugt keinen Carriage Return im geparsten Wert", () => {
    const got = roundTrip("description", "Dichte ($\\rho$)") as string;
    expect(got).not.toContain("\r");
    expect(got).toContain("\\rho");
  });
});

describe("yamlScalar — YAML-Schluesselwoerter", () => {
  it("behaelt null/true/false/yes/no/on/off als String", () => {
    for (const v of ["null", "true", "false", "yes", "no", "on", "off", "~"]) {
      expect(roundTrip("title", v)).toBe(v);
    }
  });
});

describe("yamlScalar — Steuerzeichen und Zeilenumbrueche", () => {
  it("entfernt Steuerzeichen", () => {
    const got = roundTrip("description", "Wert mit \x08 Backspace") as string;
    expect(got).not.toContain("\x08");
    expect(got).toBe("Wert mit Backspace");
  });

  it("macht aus Zeilenumbruechen Leerzeichen", () => {
    const got = roundTrip("description", "Zeile eins\nZeile zwei") as string;
    expect(got).toBe("Zeile eins Zeile zwei");
  });
});

describe("yamlScalar — Roundtrip ueber viele Werte", () => {
  it("erzeugt parsebares YAML mit identischem Wert", () => {
    const samples = [
      "normal",
      "- dash",
      "a: b",
      'quote "x"',
      "comma, here",
      "back\\slash",
      "null",
      "true",
      "trailing ",
      " leading",
      "#hash",
      "a|b",
      "100% sure",
      "user@host",
      "`code`",
      "arr[0]",
      "{map: val}",
      "2 * 3",
      "Hi!",
      "\\",
      "",
    ];
    for (const s of samples) {
      const got = roundTrip("description", s);
      const expected = expectedValue(s);
      if (expected === "") {
        expect(got, `Wert: ${JSON.stringify(s)}`).toBeNull();
      } else {
        expect(got, `Wert: ${JSON.stringify(s)}`).toBe(expected);
      }
    }
  });
});

describe("entityFrontmatter mit realistischen kaputten Daten", () => {
  it("Entity mit Bullet-Fakt", () => {
    const e: Entity = {
      id: "aggarwal-a",
      name: "Aggarwal, A.",
      type: "person",
      aliases: [],
      facts: ["- Ist Mitautor von Studien zur Evaluierung."],
      sources: ["Notizen/Schule/Publikationen.md"],
    };
    const fm = entityFrontmatter(e, "2026-10-20");
    const docs = yaml.parseAllDocuments(serializeFrontmatter(fm)).map((d) => d.toJS()) as Record<
      string,
      unknown
    >[];
    expect(docs[0].description).toBe(
      "- Ist Mitautor von Studien zur Evaluierung.",
    );
  });
});
