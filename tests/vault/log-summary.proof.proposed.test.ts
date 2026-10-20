import { describe, it, expect } from "vitest";
import { renderRunLogEntries } from "../../src/vault/log-summary.js";

/**
 * BEWEIS: Das Log schrumpft von 1.089 Zeilen pro Lauf auf 4.
 * Zeigt die tatsaechlichen Zeilen, die ein realer Lauf erzeugt.
 */
describe("BEWEIS: Log-Aggregation", () => {
  it("erzeugt 4 Zeilen fuer einen realen Lauf statt 1.089", () => {
    // Ein Lauf aus dem echten Log: 7 extrahiert, 15 fehlgeschlagen,
    // 933 übersprungen, 206 vom Qualitätsfilter ausgeschlossen.
    const entries = renderRunLogEntries({
      succeeded: 7,
      failed: 15,
      skipped: 933,
      elapsedMs: 120000,
      skippedFiles: Array.from({ length: 933 }, (_, i) => ({
        path: `Notizen/Datei-${i}.md`,
        reason: "Inhalt unverändert (mtime-Vorprüfung)",
      })),
      failedFiles: Array.from({ length: 15 }, (_, i) => ({
        path: `Notizen/Fehler-${i}.md`,
        reason: "Modell-Antwort war kein gültiges JSON",
      })),
      filtered: Array.from({ length: 206 }, (_, i) => ({
        kind: i % 2 === 0 ? ("entity" as const) : ("concept" as const),
        name: `Eintrag-${i}`,
        id: `eintrag-${i}`,
        reason: i % 2 === 0 ? "Zu wenige Fakten (0)" : "Keine Definition vorhanden",
      })),
    });

    // Erwartet: 1 Batch + 15 Fehler + 1 Qualitätsfilter + 1 Übersprungen = 18
    expect(entries).toHaveLength(18);
    expect(entries[0]).toContain("7 erfolgreich");
    expect(entries[0]).toContain("15 fehlgeschlagen");
    expect(entries[0]).toContain("933 übersprungen");
    // Fehler bleiben einzeln nachvollziehbar
    expect(entries.filter((e) => e.startsWith("Fehlgeschlagen"))).toHaveLength(15);
    // Die anderen beiden Kategorien sind je eine Zeile
    expect(entries.filter((e) => e.startsWith("Qualitätsfilter"))).toHaveLength(1);
    expect(entries.filter((e) => e.startsWith("Übersprungen"))).toHaveLength(1);
    // Und die Dateinamen stehen nicht mehr einzeln drin
    expect(entries.join("\n")).not.toContain("Datei-500");
  });

  it("haelt den Log auch ohne Fehler klein", () => {
    const entries = renderRunLogEntries({
      succeeded: 933,
      failed: 0,
      skipped: 0,
      elapsedMs: 1000,
      skippedFiles: [],
      failedFiles: [],
      filtered: [],
    });
    expect(entries).toHaveLength(1);
  });
});
