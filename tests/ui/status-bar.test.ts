import { describe, it, expect } from "vitest";
import { StatusBarWidget } from "../../src/ui/status-bar.js";
import { ProgressEmitter } from "../../src/runtime/progress.js";

function fakeEl(): { setText: (t: string) => void; texts: string[] } {
	const texts: string[] = [];
	return {
		setText: (t: string) => texts.push(t),
		texts,
	};
}

describe("StatusBarWidget", () => {
	it("starts in the idle state", () => {
		const el = fakeEl();
		const emitter = new ProgressEmitter();
		new StatusBarWidget(el, emitter);
		expect(el.texts.at(-1)).toBe("LLM Wiki");
	});

	it("updates to indexing label on batch-started + file-completed events", () => {
		const el = fakeEl();
		const emitter = new ProgressEmitter();
		new StatusBarWidget(el, emitter);
		emitter.emit("batch-started", { total: 10 });
		expect(el.texts.at(-1)).toMatch(/Indizierung 0\/10/);
		emitter.emit("file-completed", {
			path: "a.md",
			index: 1,
			total: 10,
			entitiesAdded: 0,
			conceptsAdded: 0,
		});
		expect(el.texts.at(-1)).toMatch(/Indizierung 1\/10/);
	});

	it("tracks skipped files separately from real extractions (resumed run)", () => {
		const el = fakeEl();
		const emitter = new ProgressEmitter();
		new StatusBarWidget(el, emitter);
		emitter.emit("batch-started", { total: 100 });

		// Simulate 5 files skipped instantly (e.g. resumed run), then 1 real
		// extraction that takes ~5 s.
		emitter.emit("file-skipped", {
			path: "s1.md",
			index: 1,
			total: 100,
			reason: "Inhalt unverändert",
		});
		emitter.emit("file-skipped", {
			path: "s2.md",
			index: 2,
			total: 100,
			reason: "Inhalt unverändert",
		});
		emitter.emit("file-skipped", {
			path: "s3.md",
			index: 3,
			total: 100,
			reason: "Inhalt unverändert",
		});
		emitter.emit("file-skipped", {
			path: "s4.md",
			index: 4,
			total: 100,
			reason: "Inhalt unverändert",
		});
		emitter.emit("file-skipped", {
			path: "s5.md",
			index: 5,
			total: 100,
			reason: "Inhalt unverändert",
		});

		// After only skips, the widget should show "Berechnung läuft…".
		expect(el.texts.at(-1)).toBe(
			"Indizierung 5/100 · Berechnung läuft…",
		);

		// Now simulate 1 real extraction taking 5 s.
		// We can't easily fake the clock, so we emit a file-completed and
		// check the progress label reflects 51/100.
		emitter.emit("file-completed", {
			path: "r1.md",
			index: 6,
			total: 100,
			entitiesAdded: 1,
			conceptsAdded: 1,
		});

		// Progress label should reflect 6/100 (5 skipped + 1 completed).
		expect(el.texts.at(-1)).toMatch(/Indizierung 6\/100/);
	});

	it("returns to idle after batch-completed", () => {
		const el = fakeEl();
		const emitter = new ProgressEmitter();
		new StatusBarWidget(el, emitter);
		emitter.emit("batch-started", { total: 1 });
		emitter.emit("file-completed", {
			path: "a.md",
			index: 1,
			total: 1,
			entitiesAdded: 0,
			conceptsAdded: 0,
		});
		emitter.emit("batch-completed", {
			processed: 1,
			succeeded: 1,
			failed: 0,
			skipped: 0,
			total: 1,
			elapsedMs: 100,
		});
		expect(el.texts.at(-1)).toBe("LLM Wiki");
	});

	it("shows the error state on batch-errored", () => {
		const el = fakeEl();
		const emitter = new ProgressEmitter();
		new StatusBarWidget(el, emitter);
		emitter.emit("batch-errored", { message: "KB changed externally" });
		expect(el.texts.at(-1)).toBe("⚠ KB changed externally");
	});

	it("resets the skip counter on a new batch-started", () => {
		const el = fakeEl();
		const emitter = new ProgressEmitter();
		new StatusBarWidget(el, emitter);

		// First batch: 3 files skipped.
		emitter.emit("batch-started", { total: 10 });
		emitter.emit("file-skipped", {
			path: "a.md",
			index: 1,
			total: 10,
			reason: "x",
		});
		emitter.emit("file-skipped", {
			path: "b.md",
			index: 2,
			total: 10,
			reason: "x",
		});
		emitter.emit("file-skipped", {
			path: "c.md",
			index: 3,
			total: 10,
			reason: "x",
		});

		// Second batch: should reset, no skips carried over.
		emitter.emit("batch-started", { total: 5 });
		emitter.emit("file-completed", {
			path: "d.md",
			index: 1,
			total: 5,
			entitiesAdded: 0,
			conceptsAdded: 0,
		});
		expect(el.texts.at(-1)).toMatch(/Indizierung 1\/5/);
	});
});
