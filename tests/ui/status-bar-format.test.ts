import { describe, it, expect } from "vitest";
import { formatEta, formatIndexingLabel } from "../../src/ui/status-bar-format.js";

describe("formatEta", () => {
	it("returns 'Berechnung läuft…' until 1 file has completed", () => {
		expect(formatEta(1_000, 0, 10)).toBe("Berechnung läuft…");
	});

	it("returns a seconds estimate when the total remaining is under a minute", () => {
		// 3 files in 3s = 1s each; 7 left => ~7s verbleibend.
		expect(formatEta(3_000, 3, 10)).toBe("~7s verbleibend");
	});

	it("returns a minutes estimate when remaining is under an hour", () => {
		// 3 files in 180_000 ms (1 minute each); 10 left => 10 minutes.
		expect(formatEta(180_000, 3, 13)).toBe("~10m verbleibend");
	});

	it("returns an h+m estimate for longer runs", () => {
		// 3 files in 360_000ms (2 min each); 100 left => 200 minutes = 3h 20m.
		expect(formatEta(360_000, 3, 103)).toBe("~3h 20m verbleibend");
	});

	it("returns 'fertig' when nothing remains", () => {
		expect(formatEta(10_000, 10, 10)).toBe("fertig");
	});

	// ── Skip-aware ETA ─────────────────────────────────────────────────

	it("does not dilute the average when many files are skipped (resumed run)", () => {
		// Simulated resumed run: 50 files already extracted in a previous
		// session are now skipped instantly.  1 real extraction took 5 s.
		// Remaining: 49 files.
		// extracted = 51 - 50 = 1  →  avg = 5_000 / 1 = 5_000 ms
		// remaining = 100 - 51 = 49  →  eta ≈ 245 s ≈ 4 m
		expect(formatEta(5_050, 51, 100, 50)).toBe("~4m verbleibend");
	});

	it("returns 'Berechnung läuft…' when only skipped files have been seen so far", () => {
		// 50 files skipped in ~50 ms, no real extraction yet.
		expect(formatEta(50, 50, 100, 50)).toBe("Berechnung läuft…");
	});

	it("uses only real extractions for the average after mixed skip + extract", () => {
		// 3 skipped (instant) + 2 real extractions at 4 s each = 8 s elapsed.
		// extracted = 5 - 3 = 2  →  avg = 8_000 / 2 = 4_000 ms
		// remaining = 20 - 5 = 15  →  eta = 15 × 4 = 60 s → ~1m
		expect(formatEta(8_000, 5, 20, 3)).toBe("~1m verbleibend");
	});

	it("defaults skipped to 0 (backward compatible)", () => {
		// Without the skipped parameter the behaviour is unchanged.
		expect(formatEta(3_000, 3, 10)).toBe("~7s verbleibend");
	});
});

describe("formatIndexingLabel", () => {
	it("composes the idle-state label", () => {
		expect(formatIndexingLabel({ state: "idle" })).toBe("LLM Wiki");
	});

	it("composes the indexing-state label with ETA", () => {
		expect(
			formatIndexingLabel({
				state: "indexing",
				processed: 3,
				total: 10,
				elapsedMs: 3_000,
			}),
		).toBe("Indizierung 3/10 · ~7s verbleibend");
	});

	it("composes the indexing-state label while estimating", () => {
		expect(
			formatIndexingLabel({
				state: "indexing",
				processed: 0,
				total: 10,
				elapsedMs: 0,
			}),
		).toBe("Indizierung 0/10 · Berechnung läuft…");
	});

	it("shows a correct ETA when many files are skipped (resumed run)", () => {
		// 50 skipped + 1 real extraction (5 s), 100 total.
		// avg = 5_050 / 1 ≈ 5 s; remaining = 49; eta ≈ 4 m
		expect(
			formatIndexingLabel({
				state: "indexing",
				processed: 51,
				total: 100,
				elapsedMs: 5_050,
				skipped: 50,
			}),
		).toBe("Indizierung 51/100 · ~4m verbleibend");
	});

	it("shows 'Berechnung läuft…' when only skips have happened", () => {
		expect(
			formatIndexingLabel({
				state: "indexing",
				processed: 50,
				total: 100,
				elapsedMs: 50,
				skipped: 50,
			}),
		).toBe("Indizierung 50/100 · Berechnung läuft…");
	});

	it("composes the error-state label", () => {
		expect(
			formatIndexingLabel({ state: "error", message: "Ollama unreachable" }),
		).toBe("⚠ Ollama unreachable");
	});
});
