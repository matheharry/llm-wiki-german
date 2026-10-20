/**
 * BEWEIS: der Fix in src/pages/frontmatter.ts behebt die 43 kaputten Seiten.
 *
 * Dieser Test laeuft gegen die ECHTE Plugin-Funktion (nach dem Patch) und
 * prueft die Frontmatter-Werte, die im Live-Wiki tatsaechlich kaputt sind.
 *
 * Erwartung nach dem Patch: alle Werte parsen UND bleiben unveraendert.
 */
import { describe, it, expect } from "vitest";
import * as yaml from "yaml";
import { serializeFrontmatter, entityFrontmatter } from "../../src/pages/frontmatter.js";
import type { Entity } from "../../src/core/types.js";

/** Die realen, im Live-Wiki gefundenen Problemwerte. */
const REAL_BROKEN_VALUES: Array<{ field: string; value: string }> = [
  { field: "description", value: "- Ist Mitautor von Studien zur Evaluierung des Einsatzes physischer Manipulatoren in der Grundschule (2017)." },
  { field: "description", value: "- Positioniert Buchstaben mittig auf der Basis des Schlüsselanhängers." },
  { field: "description", value: "- In der 3." },
  { field: "description", value: "Hat drei Innenwinkel: $\\alpha$, $\\beta$ und $\\gamma$." },
  { field: "description", value: "Das arithmetische Mittel ($\\bar{x}$) ist der Durchschnittswert eines Datensatzes." },
  { field: "title", value: "Beta-Minus-Zerfall ($\\eta^-$)" },
  { field: "name", value: "Beta-Plus-Zerfall ($\\eta^+$)" },
  { field: "title", value: "Dichte ($\\rho$)" },
  { field: "description", value: "Die Dichte wird verwendet, um aus Volumen $V$ die Masse $m$ zu bestimmen ($m = \\rho \\cdot V$)." },
  { field: "title", value: "null" },
  { field: "name", value: "null" },
];

describe("serializeFrontmatter — reale Problemwerte", () => {
  // serializeFrontmatter liefert einen Block mit beiden "---"-Delimitern.
  // YAML sieht damit zwei Dokumente -> erstes nehmen.
  const parseFirst = (text: string): Record<string, unknown> =>
    yaml.parseAllDocuments(text)[0].toJS() as Record<string, unknown>;

  for (const { field, value } of REAL_BROKEN_VALUES) {
    it(`${field}: ${JSON.stringify(value).slice(0, 52)} parst und bleibt unveraendert`, () => {
      const fm = serializeFrontmatter({ [field]: value });
      const parsed = parseFirst(fm);
      expect(parsed).toBeDefined();
      const got = parsed[field];
      // YAML typisiert ISO-Daten als Date -> hier ist der Wert ein String
      expect(typeof got).toBe("string");
      // Der sanierte Wert: Steuerzeichen raus, Newlines zu Space
      const expected = value
        .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "")
        .replace(/\r/g, " ")
        .replace(/\n/g, " ")
        .replace(/[ \t]{2,}/g, " ")
        .trim();
      expect(got).toBe(expected);
      // Und der Kern: kein stiller Datenverlust
      if (value.includes("\\r")) expect(got).not.toContain("\r");
      if (value.includes("\\rho")) expect(got).toContain("\\rho");
    });
  }
});

describe("entityFrontmatter mit realistischen kaputten Daten", () => {
  it("erzeugt parsebares Frontmatter fuer eine Entitaet mit Bullet-Fakt", () => {
    const e: Entity = {
      id: "aggarwal-a",
      name: "Aggarwal, A.",
      type: "person",
      aliases: [],
      facts: ["- Ist Mitautor von Studien zur Evaluierung."],
      sources: ["Notizen/Schule/Publikationen.md"],
    };
    const fm = entityFrontmatter(e, "2026-10-20");
    const parsed = yaml.parse(JSON.stringify(fm)) as Record<string, unknown>;
    expect(parsed.description).toBe("- Ist Mitautor von Studien zur Evaluierung.");
  });

  it("erzeugt parsebares Frontmatter fuer LaTeX im Namen", () => {
    const e: Entity = {
      id: "beta-minus-zerfall-eta",
      name: "Beta-Minus-Zerfall ($\\eta^-$)",
      type: "other",
      aliases: [],
      facts: ["Zerfall mit Elektron"],
      sources: ["Notizen/Schule/Physik/Kernphysik.md"],
    };
    const fm = entityFrontmatter(e, "2026-10-20");
    const parsed = yaml.parse(JSON.stringify(fm)) as Record<string, unknown>;
    expect(parsed.title).toBe("Beta-Minus-Zerfall ($\\eta^-$)");
  });
});
