import { describe, it, expect } from "vitest";
import { KnowledgeBase } from "../../src/core/kb.js";
import {
  renderIndexPage,
  renderSourcesIndexPage,
  groupByInitial,
  previewText,
} from "../../src/pages/render-index.js";

/**
 * Der Index hatte 11.287 Zeilen / 2,7 MB: 5.404 Konzepte, 4.779 Entitäten
 * und 1.001 Quellen in je einer flachen Liste. Jetzt: alphabetische
 * Unterteilung und ein ausgelagerter Quellenindex.
 */
describe("previewText", () => {
  it("laesst kurze Texte unveraendert", () => {
    expect(previewText("Kurzer Text.")).toBe("Kurzer Text.");
  });

  it("kuerzt lange Texte und markiert die Auslassung", () => {
    const long = "Ein sehr langer Definitionssatz. ".repeat(20);
    const out = previewText(long, 120);
    expect(out.length).toBeLessThanOrEqual(122);
    expect(out.endsWith("…")).toBe(true);
  });

  it("bricht an einem Wortende, nicht mitten im Wort", () => {
    const out = previewText(
      "Alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima",
      40,
    );
    expect(out).not.toMatch(/[a-z]…$/);
  });

  it("behandelt leere Eingabe", () => {
    expect(previewText("")).toBe("");
    expect(previewText(undefined as unknown as string)).toBe("");
  });
});

describe("groupByInitial", () => {
  it("gruppiert nach dem ersten Buchstaben", () => {
    const groups = groupByInitial([
      { name: "Ampel" },
      { name: "Baum" },
      { name: "Apfel" },
    ]);
    expect(groups.map((g) => g.letter)).toEqual(["A", "B"]);
    expect(groups[0].items.map((i) => i.name)).toEqual(["Ampel", "Apfel"]);
  });

  it("ignoriert fuehrende Sonderzeichen", () => {
    // Anfuehrungszeichen und Klammern sollen die Gruppierung nicht stoeren.
    const groups = groupByInitial([
      { name: '"Klima"' },
      { name: "(Bilanz)" },
      { name: "Zebra" },
    ]);
    expect(groups.map((g) => g.letter)).toEqual(["B", "K", "Z"]);
  });

  it("fasst Ziffern als eigene Gruppen", () => {
    const groups = groupByInitial([{ name: "3D-Druck" }, { name: "Ampel" }]);
    expect(groups.map((g) => g.letter)).toEqual(["3", "A"]);
  });

  it("legt Namen ohne Buchstaben unter #", () => {
    const groups = groupByInitial([{ name: "!!!" }, { name: "Ampel" }]);
    expect(groups.map((g) => g.letter)).toEqual(["A", "#"]);
  });
});

/** KB mit einer registrierten Quelle (markSource erzeugt den Source-Record). */
function kbWithSources(): KnowledgeBase {
  const kb = new KnowledgeBase();
  kb.markSource({
    path: "Notizen/A.md",
    summary: "Eine Notiz.",
    mtime: 0,
    origin: "user-note",
  });
  kb.markSource({
    path: "Clippings/B.md",
    summary: "Ein Clipping.",
    mtime: 0,
    origin: "user-note",
  });
  return kb;
}

describe("renderIndexPage", () => {
  it("unterteilt Konzepte alphabetisch", () => {
    const kb = new KnowledgeBase();
    kb.addConcept({ name: "Zebra", definition: "Ein Tier." });
    kb.addConcept({ name: "Ameise", definition: "Ein Insekt." });
    kb.addConcept({ name: "Biene", definition: "Ein Insekt." });

    const page = renderIndexPage(kb, "2026-10-20");
    expect(page).toContain("## Konzepte");
    expect(page).toContain("### A");
    expect(page).toContain("### B");
    expect(page).toContain("### Z");
    expect(page.indexOf("### A")).toBeLessThan(page.indexOf("### B"));
    expect(page.indexOf("### B")).toBeLessThan(page.indexOf("### Z"));
  });

  it("lagert die Quellen aus und verweist auf den Quellenindex", () => {
    const kb = kbWithSources();
    kb.addConcept({ name: "Test", definition: "Ein Test." });

    const page = renderIndexPage(kb, "2026-10-20");
    // Keine einzelnen Quellen mehr im Hauptindex
    expect(page).not.toContain("[[wiki/sources/Notizen/A.md");
    // Stattdessen ein Verweis
    expect(page).toContain("[[wiki/quellen-index|Quellenindex]]");
    expect(page).toContain("## Weitere");
    expect(page).toContain("2 Quellen");
  });

  it("zeigt einen leeren Quellenverweis, wenn es keine Quellen gibt", () => {
    const kb = new KnowledgeBase();
    kb.addConcept({ name: "Test", definition: "Ein Test." });
    const page = renderIndexPage(kb, "2026-10-20");
    expect(page).toContain("Noch keine Quellen erfasst.");
  });

  it("gruppierentities nach Typ", () => {
    const kb = new KnowledgeBase();
    kb.addEntity({ name: "Muster", type: "person", facts: ["Fakt."], source: "A.md" });
    kb.addEntity({ name: "Werkzeug", type: "tool", facts: ["Fakt."], source: "A.md" });

    const page = renderIndexPage(kb, "2026-10-20");
    expect(page).toContain("### Personen");
    expect(page).toContain("### Werkzeuge");
  });
});

describe("renderSourcesIndexPage", () => {
  it("gruppiert Quellen nach Herkunftsortner", () => {
    const page = renderSourcesIndexPage(kbWithSources(), "2026-10-20");
    expect(page).toContain("## Clippings");
    expect(page).toContain("## Notizen");
    expect(page).toContain("[[wiki/sources/Notizen/A.md|Notizen/A.md]]");
    expect(page).toContain("[[wiki/sources/Clippings/B.md|Clippings/B.md]]");
  });

  it("verweist zurueck auf den Hauptindex", () => {
    const page = renderSourcesIndexPage(kbWithSources(), "2026-10-20");
    expect(page).toContain("[[wiki/index|Hauptindex]]");
  });

  it("verarbeitet leere Quellenlisten", () => {
    const page = renderSourcesIndexPage(new KnowledgeBase(), "2026-10-20");
    expect(page).toContain("Noch keine Quellen erfasst.");
  });
});
