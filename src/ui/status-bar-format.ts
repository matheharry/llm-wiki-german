/**
 * Pure formatting helpers for the status bar. No DOM, no Obsidian API.
 * Separated from the widget itself so the ETA math is unit-tested in
 * isolation.
 */

export function formatEta(
  elapsedMs: number,
  completed: number,
  total: number,
): string {
  if (completed >= total) return "fertig";
  if (completed < 1) return "Berechnung läuft…";
  const remaining = total - completed;
  const avgMs = elapsedMs / completed;
  const etaSec = Math.round((remaining * avgMs) / 1000);
  if (etaSec < 60) return `~${Math.max(1, etaSec)}s verbleibend`;
  const etaMin = Math.round(etaSec / 60);
  if (etaMin < 60) return `~${etaMin}m verbleibend`;
  const h = Math.floor(etaMin / 60);
  const m = etaMin % 60;
  return `~${h}h ${m}m verbleibend`;
}

export type StatusBarState =
  | { state: "idle" }
  | {
      state: "indexing";
      processed: number;
      total: number;
      elapsedMs: number;
    }
  | { state: "error"; message: string };

export function formatIndexingLabel(state: StatusBarState): string {
  switch (state.state) {
    case "idle":
      return "LLM Wiki";
    case "indexing": {
      const eta = formatEta(state.elapsedMs, state.processed, state.total);
      return `Indizierung ${state.processed}/${state.total} · ${eta}`;
    }
    case "error":
      return `⚠ ${state.message}`;
  }
}
