import type { KnowledgeBase } from "../core/kb.js";
import type {
  ConnectionType,
  EntityType,
  SourceOrigin,
} from "../core/types.js";
import { exportVocabulary } from "../core/vocabulary.js";
import type { LLMProvider } from "../llm/provider.js";
import { DEFAULT_CHAR_LIMIT } from "./defaults.js";
import { splitIntoChunks, type Chunk } from "./chunker.js";
import { buildExtractionPrompt } from "./prompts.js";
import {
  parseExtraction,
  type ParsedExtraction,
} from "./parser.js";
import {
  stripBase64Images,
  condenseCodeBlocks,
  truncateAtBoundary,
} from "./preprocess.js";
import { sha256Hex } from "./content-hash.js";

export interface ExtractFileInput {
  path: string;
  /** Explicit content string. Optional if `getContent` lazy reader is provided. */
  content?: string;
  /** Lazy reader function that resolves the content string on demand. */
  getContent?: () => Promise<string>;
  mtime: number;
  /** SHA-256 hex digest of `content`. Optional; computed on demand if missing. */
  contentHash?: string;
  origin: SourceOrigin;
}

export interface ExtractFileArgs {
  provider: LLMProvider;
  kb: KnowledgeBase;
  file: ExtractFileInput;
  model: string;
  outputLanguage?: string;
  signal?: AbortSignal;
  charLimit?: number;
  /**
   * Pre-computed vocabulary snapshot to include in the prompt.
   * When provided, the per-file `exportVocabulary(kb)` call is skipped.
   * Callers that process many files (e.g. `runExtraction`) should freeze
   * this once at batch start to avoid O(n²) re-exports.
   */
  vocabulary?: string;
  /** Resolved content string if already loaded by caller. */
  resolvedContent?: string;
  /** Resolved content hash if already computed by caller. */
  resolvedContentHash?: string;
  /** Called with the raw LLM response when it cannot be parsed, so the
   *  caller can include a diagnostic preview in the failure log. */
  onParseError?: (raw: string) => void;
  /**
   * When enabled (default), files longer than `charLimit` are split into
   * chunks and each chunk is extracted separately. This preserves
   * information from the whole document instead of truncating the tail.
   * Disable to keep the legacy truncate-at-limit behaviour.
   */
  chunkingEnabled?: boolean;
  /** Max number of chunks per file. Defaults to DEFAULT_MAX_CHUNKS. */
  maxChunks?: number;
  /** Overlap characters repeated at the start of each chunk (except the
   *  first). Defaults to DEFAULT_CHUNK_OVERLAP_CHARS. */
  chunkOverlapChars?: number;
}

/** Truncate a diagnostic preview for error messages. */
export function previewRawResponse(raw: string, max = 200): string {
  const singleLine = raw.replace(/\s+/g, " ").trim();
  if (singleLine.length <= max) return singleLine;
  return singleLine.slice(0, max) + "…";
}

const ENTITY_TYPES: ReadonlySet<EntityType> = new Set<EntityType>([
  "person",
  "org",
  "tool",
  "project",
  "book",
  "article",
  "place",
  "event",
  "other",
]);

const CONNECTION_TYPES: ReadonlySet<ConnectionType> = new Set<ConnectionType>([
  "influences",
  "uses",
  "critiques",
  "extends",
  "part-of",
  "created-by",
  "related-to",
  "applies-to",
  "contrasts-with",
]);

const ENTITY_TYPE_MAP: Record<string, EntityType> = {
  person: "person",
  personne: "person",
  persona: "person",
  personen: "person",
  leute: "person",
  org: "org",
  organization: "org",
  organisation: "org",
  company: "org",
  firma: "org",
  unternehmen: "org",
  tool: "tool",
  outil: "tool",
  herramienta: "tool",
  werkzeug: "tool",
  project: "project",
  projet: "project",
  proyecto: "project",
  projekt: "project",
  book: "book",
  livre: "book",
  libro: "book",
  buch: "book",
  article: "article",
  place: "place",
  lieu: "place",
  lugar: "place",
  ort: "place",
  event: "event",
  événement: "event",
  evento: "event",
  ereignis: "event",
};

const CONNECTION_TYPE_MAP: Record<string, ConnectionType> = {
  influences: "influences",
  influence: "influences",
  influye: "influences",
  beeinflusst: "influences",
  uses: "uses",
  utilise: "uses",
  usa: "uses",
  benutzt: "uses",
  verwendet: "uses",
  critiques: "critiques",
  critique: "critiques",
  kritisiert: "critiques",
  extends: "extends",
  étend: "extends",
  extiende: "extends",
  erweitert: "extends",
  "part-of": "part-of",
  "partie-de": "part-of",
  "parte-de": "part-of",
  "teil-von": "part-of",
  "created-by": "created-by",
  "créé-par": "created-by",
  "creado-por": "created-by",
  "erstellt-von": "created-by",
  "related-to": "related-to",
  "lié-à": "related-to",
  "relacionado-con": "related-to",
  "verknüpft-mit": "related-to",
  "applies-to": "applies-to",
  "s'applique-à": "applies-to",
  "se-aplica-a": "applies-to",
  "bezieht-sich-auf": "applies-to",
  "contrasts-with": "contrasts-with",
  "contraste-avec": "contrasts-with",
  "contrasta-con": "contrasts-with",
  "steht-im-kontrast-zu": "contrasts-with",
};

function normalizeEntityType(raw: string | undefined): EntityType {
  if (!raw) return "other";
  const low = raw.toLowerCase().trim();
  return ENTITY_TYPE_MAP[low] ?? (ENTITY_TYPES.has(low as EntityType) ? (low as EntityType) : "other");
}

function normalizeConnectionType(raw: string | undefined): ConnectionType {
  if (!raw) return "related-to";
  const low = raw.toLowerCase().trim();
  return (
    CONNECTION_TYPE_MAP[low] ??
    (CONNECTION_TYPES.has(low as ConnectionType)
      ? (low as ConnectionType)
      : "related-to")
  );
}

/** Mutate the KB from a single parsed extraction. */
function mergeParsedIntoKb(
  parsed: ParsedExtraction,
  kb: KnowledgeBase,
  sourcePath: string,
  generatedBy: string,
): void {
  for (const ent of parsed.entities) {
    const name = (ent.name ?? "").trim();
    if (!name) continue;
    const type = normalizeEntityType(ent.type);
    kb.addEntity({
      name,
      type,
      aliases: ent.aliases ?? [],
      facts: ent.facts ?? [],
      shortDescription: ent.short_description,
      generatedBy,
      source: sourcePath,
    });
  }

  for (const con of parsed.concepts) {
    const name = (con.name ?? "").trim();
    if (!name) continue;
    kb.addConcept({
      name,
      definition: String(con.definition ?? "").trim(),
      shortDescription: con.short_description,
      generatedBy,
      related: con.related ?? [],
      source: sourcePath,
    });
  }

  for (const conn of parsed.connections) {
    const from = (conn.from ?? "").trim();
    const to = (conn.to ?? "").trim();
    if (!from || !to) continue;
    const type = normalizeConnectionType(conn.type);
    kb.addConnection({
      from,
      to,
      type,
      description: conn.description ?? "",
      source: sourcePath,
    });
  }
}

/**
 * Extract structured knowledge from a single file and merge into the KB.
 *
 * When the file is longer than `charLimit` and chunking is enabled (default),
 * the content is split into manageable chunks and each chunk is extracted
 * separately. Parsed entities/concepts/connections from all chunks are merged
 * into the KB (deduplication happens via the KB's slug-based merge logic).
 * A failed chunk does not abort the file — successful chunks are still kept.
 * The source record is marked only once, after all chunks have been tried.
 *
 * Returns the first parsed extraction on success, or null if no chunk
 * produced a parseable response (the KB is untouched and the source is
 * NOT marked as processed — a later retry will re-attempt the file).
 */
export async function extractFile(
  args: ExtractFileArgs,
): Promise<ParsedExtraction | null> {
  const rawContent =
    args.resolvedContent ??
    args.file.content ??
    (args.file.getContent ? await args.file.getContent() : "");

  const limit = args.charLimit ?? DEFAULT_CHAR_LIMIT;
  const chunkingEnabled = args.chunkingEnabled !== false;
  const vocabulary = args.vocabulary ?? exportVocabulary(args.kb);
  const generatedBy = args.model ? `${args.model}` : "llm-wiki-german/1.1.0c";

  // Clean base64 blobs and condense long code blocks *before* chunking so the
  // chunks contain only meaningful text. Truncation happens only when chunking
  // is disabled (legacy behaviour).
  const cleaned = stripBase64Images(rawContent);
  const condensed = condenseCodeBlocks(cleaned);
  const content =
    chunkingEnabled ? condensed : truncateAtBoundary(condensed, limit);

  // Determine the chunks to process. A single chunk is used when the content
  // fits within the limit or chunking is disabled.
  const chunks: Chunk[] =
    chunkingEnabled && content.length > limit
      ? splitIntoChunks(content, {
          chunkSize: limit,
          overlapChars: args.chunkOverlapChars,
          maxChunks: args.maxChunks,
        })
      : [{ index: 1, text: content, startOffset: 0 }];

  let firstParsed: ParsedExtraction | null = null;
  let anySuccess = false;

  for (const chunk of chunks) {
    const prompt = buildExtractionPrompt({
      vocabulary,
      sourcePath: args.file.path,
      content: chunk.text,
      outputLanguage: args.outputLanguage ?? "English",
    });

    let raw = "";
    for await (const piece of args.provider.complete({
      prompt,
      model: args.model,
      signal: args.signal,
    })) {
      raw += piece;
    }

    const parsed = parseExtraction(raw);
    if (!parsed) {
      args.onParseError?.(raw);
      continue; // skip this chunk; keep successful ones
    }

    if (!firstParsed) firstParsed = parsed;
    mergeParsedIntoKb(parsed, args.kb, args.file.path, generatedBy);
    anySuccess = true;
  }

  if (!anySuccess || !firstParsed) {
    return null; // no usable extraction from any chunk
  }

  const finalHash =
    args.resolvedContentHash ??
    args.file.contentHash ??
    (await sha256Hex(rawContent));

  args.kb.markSource({
    path: args.file.path,
    summary: firstParsed.source_summary,
    shortDescription: firstParsed.source_summary_short,
    generatedBy,
    mtime: args.file.mtime,
    contentHash: finalHash,
    origin: args.file.origin,
  });

  return firstParsed;
}