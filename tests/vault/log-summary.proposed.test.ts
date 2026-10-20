import { describe, it, expect } from "vitest";
import {
  renderRunLogEntries,
  groupByReason,
  type ExtractionRunSummary,
} from "../../src/vault/log-summary.js";

/**
 * Das Wiki-Log wuchs auf 13.000 Zeilen / 1,9 MB, weil fuer jede Datei eine
 * eigene Zeile geschrieben wurde — 9.760 davon allein mit dem Grund
 * "Inhalt unverändert". Jetzt: ein Sammel-Eintrag pro Lauf.
 */
describe("groupByReason", () => {
  it("fasst Dateien nach Grund zusammen", () => {
    const groups = groupByReason([
      { path: "a.md", reason: "Inhalt unverändert" },
      { path: "b.md", reason: "Inhalt unverändert" },
      { path: "c.md", reason: "Hash-Prüfung fehlgeschlagen" },
    ]);
    expect(groups).toEqual([
      { reason: "Inhalt unverändert", count: 2 },
      { reason: "Hash-Prüfung fehlgeschlagen", count: 1 },
    ]);
  });

  it("sortiert nach Häufigkeit absteigend", () => {
    const groups = groupByReason([
      { path: "a.md", reason: "selten" },
      { path: "b.md", reason: "oft" },
      { path: "c.md", reason: "oft" },
    ]);
    expect(groups[0].reason).toBe("oft");
    expect(groups[0].count).toBe(2);
  });
});

describe("renderRunLogEntries", () => {
  const base: ExtractionRunSummary = {
    succeeded: 7,
    failed: 2,
    skipped: 933,
    elapsedMs: 12340,
    skippedFiles: [],
    failedFiles: [],
    filtered: [],
  };

  it("erzeugt genau eine Zeile, wenn nichts Besonderes passiert ist", () => {
    const entries = renderRunLogEntries(base);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toContain("7 erfolgreich");
    expect(entries[0]).toContain("2 fehlgeschlagen");
    expect(entries[0]).toContain("933 übersprungen");
  });

  it("fasst 933 übersprungene Dateien in EINE Zeile zusammen", () => {
    const skippedFiles = Array.from({ length: 933 }, (_, i) => ({
      path: `Notizen/Datei-${i}.md`,
      reason: "Inhalt unverändert (mtime-Vorprüfung)",
    }));
    const entries = renderRunLogEntries({ ...base, skippedFiles });
    // 1 Batch + 1 Übersprungen-Zeile
    expect(entries).toHaveLength(2);
    expect(entries[1]).toContain("Übersprungen |");
    expect(entries[1]).toContain("933x");
    // Keine einzelnen Dateinamen
    expect(entries[1]).not.toContain("Datei-0");
  });

  it("listet Fehler einzeln auf — sie müssen auffindbar bleiben", () => {
    const entries = renderRunLogEntries({
      ...base,
      failedFiles: [
        { path: "Notizen/A.md", reason: "Modell hat nicht geantwortet" },
        { path: "Notizen/B.md", reason: "JSON ungültig" },
      ],
    });
    expect(entries).toHaveLength(3);
    expect(entries[1]).toContain("Fehlgeschlagen | Notizen/A.md");
    expect(entries[1]).toContain("Modell hat nicht geantwortet");
    expect(entries[2]).toContain("Fehlgeschlagen | Notizen/B.md");
  });

  it("fasst Qualitätsfilter nach Grund zusammen", () => {
    const filtered = [
      ...Array.from({ length: 278 }, () => ({
        kind: "concept" as const,
        name: "X",
        id: "x",
        reason: "Keine Definition vorhanden",
      })),
      ...Array.from({ length: 33 }, () => ({
        kind: "entity" as const,
        name: "Y",
        id: "y",
        reason: "Keine Fakten und keine Aliasse",
      })),
    ];
    const entries = renderRunLogEntries({ ...base, filtered });
    expect(entries).toHaveLength(2);
    expect(entries[1]).toContain("Qualitätsfilter | 311 Einträge");
    expect(entries[1]).toContain("Keine Definition vorhanden (278x)");
    expect(entries[1]).toContain("Keine Fakten und keine Aliasse (33x)");
  });

  it("reduziert einen realen Lauf von 1089 auf 4 Zeilen", () => {
    const summary: ExtractionRunSummary = {
      succeeded: 7,
      failed: 15,
      skipped: 933,
      elapsedMs: 120000,
      skippedFiles: Array.from({ length: 933 }, () => ({
        path: "x.md",
        reason: "Inhalt unverändert (mtime-Vorprüfung)",
      })),
      failedFiles: Array.from({ length: 15 }, (_, i) => ({
        path: `f${i}.md`,
        reason: "Fehler",
      })),
      filtered: Array.from({ length: 206 }, () => ({
        kind: "concept" as const,
        name: "c",
        id: "c",
        reason: "Zu wenige Fakten (0)",
      })),
    };
    const entries = renderRunLogEntries(summary);
    // 1 Batch + 15 Fehler + 1 Qualitätsfilter + 1 Übersprungen
    expect(entries).toHaveLength(18);
    expect(entries.length).toBeLessThan(20);
  });
});
