import { describe, it, expect } from "vitest";
import { formatIndexingStatus } from "../../../src/ui/modal/indexing-status.js";

describe("formatIndexingStatus", () => {
  it("returns 'Vorbereitung…' for idle", () => {
    expect(formatIndexingStatus({ kind: "idle" })).toBe("Vorbereitung…");
  });

  it("shows 'Index wird aufgebaut…' before the first item is processed", () => {
    expect(
      formatIndexingStatus({
        kind: "building",
        progress: { current: 0, total: 0 },
      }),
    ).toBe("Index wird aufgebaut…");
  });

  it("shows current/total when total is known", () => {
    expect(
      formatIndexingStatus({
        kind: "building",
        progress: { current: 3, total: 12 },
      }),
    ).toBe("Index wird aufgebaut… 3 / 12");
  });

  it("returns 'Bereit' when ready", () => {
    expect(
      formatIndexingStatus({
        kind: "ready",
        index: new Map(),
      }),
    ).toBe("Bereit");
  });

  it("returns a fallback warning when in a non-connect error", () => {
    expect(
      formatIndexingStatus({
        kind: "error",
        message: "ollama down",
        reason: "other",
      }),
    ).toBe("Embedding-Index nicht verfügbar (ollama down) — Ausweichmodus nur mit Stichwörtern");
  });

  it("shows the disconnected hint when the error reason is connect", () => {
    expect(
      formatIndexingStatus({
        kind: "error",
        message: "fetch failed",
        reason: "connect",
      }),
    ).toBe("Ollama getrennt — zum Wiederholen klicken");
  });
});
