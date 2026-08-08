/**
 * Pure data types for the Knowledge Base.
 *
 * No runtime logic, no Obsidian dependencies. These types describe
 * the shape of knowledge.json — the source of truth shared with the
 * Python CLI tool at ~/tools/llm-wiki/.
 */

/** Entity types matching the Python tool's extraction prompt. */
export type EntityType =
  | "person"
  | "org"
  | "tool"
  | "project"
  | "book"
  | "article"
  | "place"
  | "event"
  | "other";

/** Connection types matching the Python tool's extraction prompt. */
export type ConnectionType =
  | "influences"
  | "uses"
  | "critiques"
  | "extends"
  | "part-of"
  | "created-by"
  | "related-to"
  | "applies-to"
  | "contrasts-with";

/** Where a source file came from in the vault. */
export type SourceOrigin = "user-note" | "promoted" | "daily";

export interface VerifiedRecord {
  by: string;
  at: string;
}

export interface Entity {
  id: string;
  name: string;
  type: EntityType;
  aliases: string[];
  facts: string[];
  shortDescription?: string;
  generatedBy?: string;
  verified?: VerifiedRecord | VerifiedRecord[];
  staleAfter?: string;
  sources: string[];
}

export interface Concept {
  id: string;
  name: string;
  definition: string;
  shortDescription?: string;
  generatedBy?: string;
  verified?: VerifiedRecord | VerifiedRecord[];
  staleAfter?: string;
  related: string[];
  sources: string[];
}

export interface Connection {
  from: string;
  to: string;
  type: ConnectionType;
  description: string;
  sources: string[];
}

export interface SourceRecord {
  id: string;
  summary: string;
  shortDescription?: string;
  generatedBy?: string;
  verified?: VerifiedRecord | VerifiedRecord[];
  staleAfter?: string;
  date: string;
  mtime: number;
  /**
   * SHA-256 hex digest of the file's content at extraction time. Used as
   * the primary dedupe key by `needsExtraction` — we re-extract iff this
   * differs from the current file's hash. Optional because pre-migration
   * KBs written before hash-based dedupe shipped will not have it; those
   * entries fall back to mtime comparison until the hash is backfilled.
   */
  contentHash?: string;
  origin: SourceOrigin;
}

export interface KBMeta {
  version: number;
  created: string;
  updated: string;
}

export interface KBData {
  meta: KBMeta;
  entities: Record<string, Entity>;
  concepts: Record<string, Concept>;
  connections: Connection[];
  sources: Record<string, SourceRecord>;
}

/** OKF v0.2 specific types */
export type OKFTrustTier = "unverified" | "machine-confirmed" | "human-reviewed";
export type OKFStatus = "draft" | "stable" | "deprecated";

export interface OKFSourceEntry {
  resource: string;
  id?: string;
  title?: string;
  author?: string;
  usage_count?: number;
  last_modified?: string;
  usage_window?: { from: string; to: string };
}

export interface OKFVerification {
  by: string;
  at: string;
}

export interface OKFGenerated {
  by: string;
  at: string;
}

export interface OKFFrontmatter {
  type: string;
  title?: string;
  description?: string;
  resource?: string;
  tags?: string[];
  status?: OKFStatus;
  stale_after?: string;
  generated?: OKFGenerated;
  verified?: OKFVerification[] | OKFVerification;
  sources?: OKFSourceEntry[];
  usage_window?: { from: string; to: string };
  okf_version?: string;
  [key: string]: unknown;
}

