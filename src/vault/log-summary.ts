/**
 * Aufzeichnung eines Extraktionslaufs fuer das Wiki-Log.
 *
 * Bisher wurde fuer JEDE Datei eine eigene Log-Zeile geschrieben
 * (9.760 davon allein mit dem Grund "Inhalt unverändert"). Das Log wuchs
 * dadurch auf 13.000 Zeilen / 1,9 MB, obwohl davon nur ~15 Zeilen echten
 * Informationsgehalt hatten.
 *
 * Jetzt: ein Sammel-Eintrag pro Lauf, Details nur dort, wo sie etwas
 * erklären (Fehler, Qualitätsfilter).
 */

export interface SkippedFile {
  path: string;
  reason: string;
}

export interface FailedFile {
  path: string;
  reason: string;
}

export interface FilteredItem {
  kind: "entity" | "concept";
  name: string;
  id: string;
  reason: string;
}

export interface ExtractionRunSummary {
  succeeded: number;
  failed: number;
  skipped: number;
  elapsedMs?: number;
  /** Dateien, die übersprungen wurden. */
  skippedFiles: SkippedFile[];
  /** Dateien, bei denen die Extraktion fehlgeschlagen ist. */
  failedFiles: FailedFile[];
  /** Einträge, die vom Qualitätsfilter ausgeschlossen wurden. */
  filtered: FilteredItem[];
}

/**
 * Fasst die Skipped-Dateien nach Grund zusammen. Da der mit Abstand
 * häufigste Grund "Inhalt unverändert" ist, reicht eine Zusammenfassung
 * vollkommen aus.
 */
export function groupByReason(
  files: SkippedFile[],
): Array<{ reason: string; count: number }> {
  const counts = new Map<string, number>();
  for (const f of files) {
    counts.set(f.reason, (counts.get(f.reason) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Erzeugt die Log-Zeilen für einen Extraktionslauf.
 *
 * - Genau eine Zeile mit der Gesamtzahl (immer).
 * - Eine Zeile pro Fehler (Fehler sind selten und müssen auffindbar sein).
 * - Eine Zeile mit der Auflistung der Qualitätsfilter-Gründe, wenn es
 *   welche gab — nach Häufigkeit zusammengefasst, nicht pro Eintrag.
 */
export function renderRunLogEntries(summary: ExtractionRunSummary): string[] {
  const entries: string[] = [];

  const parts = [
    `${summary.succeeded} erfolgreich`,
    `${summary.failed} fehlgeschlagen`,
    `${summary.skipped} übersprungen`,
  ];
  if (summary.elapsedMs !== undefined) {
    parts.push(`${Math.round(summary.elapsedMs / 100) / 10}s`);
  }
  entries.push(`Ingest | Batch-Extraktion durchgeführt: ${parts.join(", ")}`);

  // Fehler: einzeln, mit Grund. Sie sind selten und müssen auffindbar bleiben.
  for (const f of summary.failedFiles) {
    entries.push(`Fehlgeschlagen | ${f.path} – ${f.reason}`);
  }

  // Qualitätsfilter: nach Grund zusammengefasst. Die betroffenen IDs stehen
  // im lint-report.md — hier reicht die Statistik.
  if (summary.filtered.length > 0) {
    const byReason = new Map<string, number>();
    for (const f of summary.filtered) {
      byReason.set(f.reason, (byReason.get(f.reason) ?? 0) + 1);
    }
    const details = [...byReason.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([reason, count]) => `${reason} (${count}x)`)
      .join("; ");
    entries.push(
      `Qualitätsfilter | ${summary.filtered.length} Einträge nicht generiert — ${details}`,
    );
  }

  // Übersprungene Dateien: nur nach Grund zusammengefasst. Eine einzelne
  // Datei, die übersprungen wurde, ist in aller Regel nicht wichtig —
  // der Grund schon ("Inhalt unverändert" vs. "Hash-Prüfung fehlgeschlagen").
  const skippedGroups = groupByReason(summary.skippedFiles);
  if (skippedGroups.length > 0) {
    const details = skippedGroups
      .map(({ reason, count }) => `${reason} (${count}x)`)
      .join("; ");
    entries.push(`Übersprungen | ${details}`);
  }

  return entries;
}
