import { describe, it, expect } from "vitest";
import { deriveTrustTier, isStale } from "../../src/core/okf.js";
import type { OKFFrontmatter } from "../../src/core/types.js";

describe("OKF v0.2 Helpers", () => {
  it("derives trust tier unverified when verified is missing or empty", () => {
    const fm1: OKFFrontmatter = { type: "Concept" };
    expect(deriveTrustTier(fm1)).toBe("unverified");

    const fm2: OKFFrontmatter = { type: "Concept", verified: [] };
    expect(deriveTrustTier(fm2)).toBe("unverified");
  });

  it("derives machine-confirmed when non-human verified", () => {
    const fm: OKFFrontmatter = {
      type: "Concept",
      verified: { by: "process:nightly", at: "2026-06-01T00:00:00Z" },
    };
    expect(deriveTrustTier(fm)).toBe("machine-confirmed");
  });

  it("derives human-reviewed when at least one human: actor verified", () => {
    const fm: OKFFrontmatter = {
      type: "Concept",
      verified: [
        { by: "process:nightly", at: "2026-06-01T00:00:00Z" },
        { by: "human:ahormati", at: "2026-06-02T00:00:00Z" },
      ],
    };
    expect(deriveTrustTier(fm)).toBe("human-reviewed");
  });

  it("evaluates staleness correctly", () => {
    const fm: OKFFrontmatter = {
      type: "Concept",
      stale_after: "2026-06-15",
    };
    expect(isStale(fm, "2026-06-14")).toBe(false);
    expect(isStale(fm, "2026-06-15")).toBe(true);
    expect(isStale(fm, "2026-06-16")).toBe(true);
  });
});
