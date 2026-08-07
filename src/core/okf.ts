import type { OKFFrontmatter, OKFTrustTier } from "./types.js";

/**
 * Derives the trust tier according to OKF v0.2 §5.3.
 * - No `verified` key => "unverified"
 * - `verified` by non-`human:` actors only => "machine-confirmed"
 * - `verified` by at least one `human:` actor => "human-reviewed"
 */
export function deriveTrustTier(frontmatter: OKFFrontmatter): OKFTrustTier {
  if (!frontmatter.verified) {
    return "unverified";
  }

  const verifications = Array.isArray(frontmatter.verified)
    ? frontmatter.verified
    : [frontmatter.verified];

  if (verifications.length === 0) {
    return "unverified";
  }

  const hasHuman = verifications.some((v) => v.by && v.by.startsWith("human:"));
  return hasHuman ? "human-reviewed" : "machine-confirmed";
}

/**
 * Checks whether an OKF concept is stale according to §5.5.
 * Content is stale when today >= stale_after.
 */
export function isStale(frontmatter: OKFFrontmatter, todayIso = new Date().toISOString().slice(0, 10)): boolean {
  if (!frontmatter.stale_after) {
    return false;
  }
  return todayIso >= frontmatter.stale_after;
}
