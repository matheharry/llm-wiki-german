/**
 * Content preprocessing for extraction prompts.
 *
 * Raw vault notes often contain content that is pure noise for an LLM
 * extraction prompt and actively harms output quality:
 *
 *  - Embedded base64 data-URIs (`![alt](data:image/jpeg;base64,...)`) are
 *    multi-kilobyte blobs of opaque text. A small local model cannot make
 *    sense of them and frequently produces unparseable JSON in response.
 *  - Very long fenced code blocks (HTML/CSS/JS) blow past the character
 *    limit and get truncated mid-block, leaving the model with a broken
 *    fragment.
 *
 * This module cleans the content *before* it is truncated and sent to the
 * LLM, so the prompt contains only meaningful, extractable text.
 */

/** Regex matching a Markdown image with a base64 data-URI. */
const DATA_URI_IMAGE_RE =
  /!\[[^\]]*\]\(\s*data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=\s]+\)/g;

/** Regex matching a bare base64 data-URI (not wrapped in an image). */
const BARE_DATA_URI_RE =
  /data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=\s]+/g;

/** Regex matching a fenced code block: ```lang ... ``` (optional space after backticks). */
const FENCED_CODE_BLOCK_RE = /```[ \t]*[a-zA-Z0-9_+-]*\n[\s\S]*?```/g;

/** Default max lines before a code block is condensed. */
export const CODE_BLOCK_MAX_LINES = 200;

/** Default context lines kept at the start of a condensed code block. */
export const CODE_BLOCK_CONTEXT_LINES = 10;

export interface PreprocessOptions {
  /** Max lines before a fenced code block is condensed. */
  codeBlockMaxLines?: number;
  /** Context lines kept at the start of a condensed code block. */
  codeBlockContextLines?: number;
}

/**
 * Replace embedded base64 images with a short placeholder.
 * Handles both `![alt](data:...)` and bare `data:...` URIs.
 */
export function stripBase64Images(content: string): string {
  return content
    .replace(DATA_URI_IMAGE_RE, "[Eingebettetes Bild]")
    .replace(BARE_DATA_URI_RE, "[Eingebettetes Bild]");
}

/**
 * Condense very long fenced code blocks into a short placeholder that
 * keeps a little context. Short code blocks are left untouched.
 */
export function condenseCodeBlocks(
  content: string,
  opts: PreprocessOptions = {},
): string {
  const maxLines = opts.codeBlockMaxLines ?? CODE_BLOCK_MAX_LINES;
  const contextLines = opts.codeBlockContextLines ?? CODE_BLOCK_CONTEXT_LINES;

  return content.replace(FENCED_CODE_BLOCK_RE, (block) => {
    const lines = block.split("\n");
    // Account for the opening ``` and closing ``` lines.
    const bodyLines = Math.max(0, lines.length - 2);
    if (bodyLines <= maxLines) return block;

    const lang = /^```[ \t]*([a-zA-Z0-9_+-]*)/.exec(lines[0] ?? "")?.[1] ?? "";
    const context = lines.slice(1, 1 + contextLines).join("\n");
    return (
      `\`\`\`${lang}\n` +
      `[Codeblock: ~${bodyLines} Zeilen, gekürzt]\n` +
      `${context}\n` +
      `\`\`\``
    );
  });
}

/**
 * Truncate content to `limit` characters at a sensible boundary.
 * Prefers to cut at a line break so we never slice mid-line, and keeps
 * the truncation marker on its own line.
 */
export function truncateAtBoundary(
  content: string,
  limit: number,
): string {
  if (content.length <= limit) return content;

  let cut = content.slice(0, limit);
  // Back up to the previous newline so we don't split a line.
  const lastNewline = cut.lastIndexOf("\n");
  if (lastNewline > limit * 0.5) {
    cut = cut.slice(0, lastNewline);
  }
  return `${cut}\n\n[... truncated ...]`;
}

/**
 * Full preprocessing pipeline applied to note content before it is sent
 * to the LLM. Order matters:
 *  1. Strip base64 images (biggest noise reduction).
 *  2. Condense long code blocks.
 *  3. Truncate at a boundary.
 */
export function preprocessContent(
  content: string,
  limit: number,
  opts: PreprocessOptions = {},
): string {
  const cleaned = stripBase64Images(content);
  const condensed = condenseCodeBlocks(cleaned, opts);
  return truncateAtBoundary(condensed, limit);
}