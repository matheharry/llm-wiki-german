/**
 * Pure formatting helpers for the status bar. No DOM, no Obsidian API.
 * Separated from the widget itself so the ETA math is unit-tested in
 * isolation.
 */

export type StatusBarState =
	| { state: "idle" }
	| {
			state: "indexing";
			processed: number;
			total: number;
			elapsedMs: number;
			/** Number of files skipped via hash/mtime check (no LLM call). */
			skipped?: number;
	  }
	| {
			state: "deduplicating";
			done: number;
			total: number;
	  }
	| { state: "error"; message: string };

/**
 * Estimates remaining time for an indexing run.
 *
 * @param elapsedMs  Time since batch-started.
 * @param completed  Index of the last file attempted (includes skips).
 * @param total      Total number of files in the batch.
 * @param skipped    How many of the `completed` files were skipped (no LLM call).
 *                   These are nearly instantaneous and must not dilute the
 *                   per-file average — otherwise a resumed run that skips
 *                   100 files in 100 ms reports a wildly inaccurate ETA.
 */
export function formatEta(
	elapsedMs: number,
	completed: number,
	total: number,
	skipped: number = 0,
): string {
	if (completed >= total) return "fertig";
	const extracted = Math.max(0, completed - skipped);
	if (extracted < 1) return "Berechnung läuft…";
	const remaining = total - completed;
	const avgMs = elapsedMs / extracted;
	const etaSec = Math.round((remaining * avgMs) / 1000);
	if (etaSec < 60) return `~${Math.max(1, etaSec)}s verbleibend`;
	const etaMin = Math.round(etaSec / 60);
	if (etaMin < 60) return `~${etaMin}m verbleibend`;
	const h = Math.floor(etaMin / 60);
	const m = etaMin % 60;
	return `~${h}h ${m}m verbleibend`;
}

export function formatIndexingLabel(state: StatusBarState): string {
	switch (state.state) {
		case "idle":
			return "LLM Wiki";
		case "indexing": {
			const eta = formatEta(
				state.elapsedMs,
				state.processed,
				state.total,
				state.skipped ?? 0,
			);
			return `Indizierung ${state.processed}/${state.total} · ${eta}`;
		}
		case "deduplicating":
			return `Deduplizierung ${state.done}/${state.total}`;
		case "error":
			return `⚠ ${state.message}`;
	}
}
