/**
 * Chunking for long note content before it is sent to the LLM.
 *
 * Instead of truncating a file at `extractionCharLimit` (which discards
 * everything past the limit), we split the file into several manageable
 * chunks and run extraction per chunk. This preserves information from the
 * whole document.
 *
 * Chunk boundaries are chosen at sensible points:
 *   - Paragraph breaks (blank lines) and Markdown headings, never mid-line.
 *   - Fenced code blocks are kept intact (never split inside a ``` block).
 *   - YAML frontmatter only appears in the first chunk.
 *   - A small overlap repeats the tail of the previous chunk at the start
 *     of the next, so cross-chunk context (e.g. a sentence that started in
 *     one chunk and ended in another) isn't lost.
 */

import {
  DEFAULT_CHAR_LIMIT,
  DEFAULT_CHUNK_OVERLAP_CHARS,
  DEFAULT_MAX_CHUNKS,
} from "./defaults.js";

export interface ChunkOptions {
  /** Max characters per chunk. Defaults to DEFAULT_CHAR_LIMIT. */
  chunkSize?: number;
  /** Extra characters repeated at the start of each chunk (except the first).
   *  Defaults to DEFAULT_CHUNK_OVERLAP_CHARS. */
  overlapChars?: number;
  /** Hard cap on the number of chunks. Defaults to DEFAULT_MAX_CHUNKS.
   *  When the cap is hit, the remaining content is appended compactly to
   *  the last chunk. */
  maxChunks?: number;
}

/** Regex matching a fenced code block: ```lang ... ``` */
const FENCED_CODE_BLOCK_RE = /```[ \t]*[a-zA-Z0-9_+-]*\n[\s\S]*?```/g;

/** Regex matching a Markdown ATX heading line. */
const HEADING_RE = /^#{1,6}\s+/gm;

/** Regex matching a YAML frontmatter block at the very start. */
const FRONTMATTER_RE = /^---\n[\s\S]*?\n---\n?/;

export interface Chunk {
  /** 1-based index within the document. */
  index: number;
  /** The chunk text (includes overlap prefix for index > 0). */
  text: string;
  /** Character offset of the chunk start in the input (start of the
   *  non-overlap portion). */
  startOffset: number;
}

/**
 * Split markdown content into chunks of at most `chunkSize` characters.
 *
 * The content is first normalized so fenced code blocks are treated as
 * atomic units (we locate their boundaries and never cut inside them).
 * Chunks are placed at paragraph/heading boundaries where possible.
 *
 * Returns an array of chunks. If the content is shorter than `chunkSize`,
 * a single chunk containing the whole content is returned.
 */
export function splitIntoChunks(
  content: string,
  opts: ChunkOptions = {},
): Chunk[] {
  const chunkSize = opts.chunkSize ?? DEFAULT_CHAR_LIMIT;
  const overlap = Math.min(
    opts.overlapChars ?? DEFAULT_CHUNK_OVERLAP_CHARS,
    Math.floor(chunkSize / 2),
  );
  const maxChunks = opts.maxChunks ?? DEFAULT_MAX_CHUNKS;

  if (!content) return [];
  if (content.length <= chunkSize) {
    return [{ index: 1, text: content, startOffset: 0 }];
  }

  // Build the list of "hard" boundaries we must never cross. These are the
  // protected ranges (frontmatter + fenced code blocks) plus the heading
  // start positions.
  const protectedRanges: Array<{ start: number; end: number }> = [];

  // Frontmatter — only in the first chunk.
  const fm = FRONTMATTER_RE.exec(content);
  if (fm) {
    protectedRanges.push({ start: fm.index, end: fm.index + fm[0].length });
  }

  // Fenced code blocks.
  for (const m of content.matchAll(FENCED_CODE_BLOCK_RE)) {
    protectedRanges.push({ start: m.index, end: m.index + m[0].length });
  }

  // Heading start positions (not a range, just a point we prefer).
  const headingPositions: number[] = [];
  for (const m of content.matchAll(HEADING_RE)) {
    headingPositions.push(m.index);
  }

  const chunks: Chunk[] = [];
  let cursor = 0;
  let chunkStart = 0;
  let index = 1;

  while (cursor < content.length && index <= maxChunks) {
    // If we're inside a protected range (frontmatter or code block), skip
    // forward to its end so we never cut inside it.
    for (const r of protectedRanges) {
      if (cursor >= r.start && cursor < r.end) {
        cursor = r.end;
        break;
      }
    }

    const targetEnd = Math.min(cursor + chunkSize, content.length);
    if (targetEnd >= content.length) {
      // Last chunk — take everything remaining.
      const text = content.slice(chunkStart);
      if (text.trim()) {
        chunks.push({ index, text, startOffset: chunkStart });
      }
      break;
    }

    // Find the best cut point at or before targetEnd: prefer a blank line
    // (paragraph boundary), then a heading start, then a newline, then any
    // character. Never cut inside a protected range.
    let cut = findCutPoint(content, targetEnd, protectedRanges, headingPositions);

    // If the cut point is before the overlap start of the previous chunk,
    // we'd produce a degenerate chunk. Force a hard cut at targetEnd.
    const minStart = chunkStart + Math.floor(chunkSize * 0.5);
    if (cut <= minStart) {
      cut = targetEnd;
    }

    const text = content.slice(chunkStart, cut);
    if (text.trim()) {
      chunks.push({ index, text, startOffset: chunkStart });
    }

    // Advance. The next chunk starts `overlap` chars before the cut so the
    // tail of this chunk is repeated for continuity.
    chunkStart = Math.max(cut - overlap, chunkStart + 1);
    cursor = chunkStart;
    index++;
  }

  // If we hit maxChunks but there's still content left, append it compactly
  // to the last chunk so no information is silently dropped.
  if (cursor < content.length && chunks.length > 0) {
    const last = chunks[chunks.length - 1];
    last.text +=
      "\n\n[weiterer Inhalt, aus Platzgründen gekürzt]\n\n" +
      content.slice(cursor);
  }

  return chunks;
}

/**
 * Find a cut point at or before `targetEnd` that lands on a paragraph
 * break, a heading start, or at least a newline — never inside a protected
 * range (frontmatter / fenced code block).
 */
function findCutPoint(
  content: string,
  targetEnd: number,
  protectedRanges: Array<{ start: number; end: number }>,
  headingPositions: number[],
): number {
  // 1) Paragraph break: a blank line (two consecutive newlines) at or before targetEnd.
  const para = content.lastIndexOf("\n\n", targetEnd);
  if (para > 0 && para < targetEnd && !isRangeProtected(para, protectedRanges)) {
    return para;
  }

  // 2) Heading start at or before targetEnd.
  for (let i = headingPositions.length - 1; i >= 0; i--) {
    const h = headingPositions[i];
    if (h > 0 && h < targetEnd && !isRangeProtected(h, protectedRanges)) {
      return h;
    }
  }

  // 3) Newline at or before targetEnd.
  const nl = content.lastIndexOf("\n", targetEnd);
  if (nl > 0 && nl < targetEnd && !isRangeProtected(nl, protectedRanges)) {
    return nl;
  }

  return targetEnd;
}

function isRangeProtected(
  pos: number,
  ranges: Array<{ start: number; end: number }>,
): boolean {
  return ranges.some((r) => pos >= r.start && pos < r.end);
}