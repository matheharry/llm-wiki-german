/**
 * Beweis-Test: der Patch in src/pages/frontmatter.ts behebt die realen,
 * im Live-Wiki gefundenen kaputten Werte.
 *
 * Die Testdaten werden aus wiki/agent-lint-report.md-artigen Quellen
 * gelesen; hier sind die konkreten, tatsaechlich gefundenen Werte
 * hinterlegt (aus entities/ und concepts/ des Live-Wiki).
 */
import { describe, it, expect } from "vitest";
import * as yaml from "yaml";
import { serializeFrontmatter } from "../../src/pages/frontmatter.js";

/** Die realen Problemwerte aus dem Live-Wiki, Seite -> Wert. */
const REAL_CASES: Array<{ rel: string; key: string; value: string }> = [
  { rel: "entities/aggarwal-a.md", key: "description", value: "- Ist Mitautor von Studien zur Evaluierung des Einsatzes physischer Manipulatoren in der Grundschule (2017)." },
  { rel: "entities/align-funktion.md", key: "description", value: "- Positioniert Buchstaben mittig auf der Basis des Schlüsselanhängers." },
  { rel: "entities/andrea.md", key: "description", value: "- Sie wird bezüglich Wiederholungsprüfungen kontaktiert." },
  { rel: "entities/bbc-microbit-v1.md", key: "description", value: "- Ist eine Version der Platine." },
  { rel: "entities/berufsorientierung-bo.md", key: "description", value: "- In der 3." },
  { rel: "entities/dreieck.md", key: "description", value: "Hat drei Innenwinkel: $\\alpha$, $\\beta$ und $\\gamma$." },
  { rel: "entities/dichte-ho.md", key: "title", value: "Dichte ($\\rho$)" },
  { rel: "entities/dichte-ho.md", key: "description", value: "Die Dichte wird verwendet, um aus Volumen $V$ die Masse $m$ des Objekts zu bestimmen ($m = \\rho \\cdot V$)." },
  { rel: "concepts/beta-minus-zerfall-eta.md", key: "title", value: "Beta-Minus-Zerfall ($\\eta^-$)" },
  { rel: "concepts/beta-plus-zerfall-eta.md", key: "name", value: "Beta-Plus-Zerfall ($\\eta^+$)" },
  { rel: "concepts/beta-strahlung-eta.md", key: "title", value: "Beta-Strahlung ($\\eta$)" },
  { rel: "concepts/arithmetisches-mittel-mittelwert-arx.md", key: "description", value: "Das arithmetische Mittel ($\\bar{x}$) ist der Durchschnittswert eines Datensatzes." },
  { rel: "entities/null.md", key: "title", value: "null" },
  { rel: "entities/null.md", key: "name", value: "null" },
];

const CONTROL = /[\x00-\x08\x0b\x0c\x0e-\x1f]/;

function expectedValue(v: string): string {
  return v
    .replace(CONTROL, "")
    .replace(/\r/g, " ")
    .replace(/\n/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

describe("BEWEIS: gepatchtes yamlScalar heilt die realen Problemwerte", () => {
  for (const c of REAL_CASES) {
    it(`${c.rel} [${c.key}] ${JSON.stringify(c.value).slice(0, 46)}`, () => {
      const text = serializeFrontmatter({ [c.key]: c.value });
      const docs = yaml.parseAllDocuments(text);
      // Kein Parse-Fehler
      expect(docs[0].errors).toEqual([]);
      const got = docs[0].toJS()[c.key];
      expect(typeof got).toBe("string");
      expect(got).toBe(expectedValue(c.value));
    });
  }

  it("ALLE 13 Faelle sind gleichzeitig parsebar", () => {
    const failures: string[] = [];
    for (const c of REAL_CASES) {
      const text = serializeFrontmatter({ [c.key]: c.value });
      try {
        const docs = yaml.parseAllDocuments(text);
        if (docs[0].errors.length > 0) {
          failures.push(`${c.rel}: ${docs[0].errors[0].message}`);
          continue;
        }
        const got = docs[0].toJS()[c.key];
        if (got !== expectedValue(c.value)) {
          failures.push(`${c.rel}: Wert veraendert -> ${String(got)}`);
        }
      } catch (e) {
        failures.push(`${c.rel}: ${String(e)}`);
      }
    }
    expect(failures).toEqual([]);
  });
});
