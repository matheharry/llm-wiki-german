/**
 * Hard-coded defaults for Phase 2. Phase 5 will surface these in the
 * settings UI; isolating them here now means that refactor is a pure
 * move-to-settings operation.
 */

export const DEFAULT_CHAR_LIMIT = 12_000;

/** Default extra characters repeated at the start of each chunk so context
 *  from the previous chunk isn't lost (continuity for the LLM). */
export const DEFAULT_CHUNK_OVERLAP_CHARS = 300;

/** Hard cap on the number of chunks per file. Prevents runaway cost for
 *  very large notes, especially with pay-per-call cloud providers. When
 *  exceeded, remaining content is appended compactly to the last chunk. */
export const DEFAULT_MAX_CHUNKS = 20;

/** Minimum file size (in characters) before a file is considered
 *  worth extracting. Below this, the file is skipped.
 *
 *  300 statt 100: Im Live-Vault lagen 73 KB-Quellen unter 300 B. Sie
 *  erzeugten pro Nachtlauf 73 sinnlose LLM-Aufrufe, ohne einen einzigen
 *  verwertbaren Eintrag zu liefern. Gemessen in `knowledge.json`:
 *  6 Dateien < 100 B, 67 Dateien 100-299 B, 884 ab 300 B.
 *  Die Grenze ist ein Kompromiss: sie verwirft reine Kurznotizen
 *  (Autor:innen-Listen, Ein-Link-Notizen), behält aber alles, was
 *  tatsaechlich Inhalt traegt.
 */
export const DEFAULT_MIN_FILE_SIZE = 300;

/**
 * Directory names to skip when walking the vault for extraction.
 * Takes the user's configDir at call time so we never assume
 * `.obsidian` (Obsidian lets users move it).
 */
export function defaultSkipDirs(configDir: string): string[] {
  return [
    "wiki",
    configDir,
    ".trash",
    ".git",
    "Template",
    "Templates",
    "Vorlagen",
    "Bases",
    "Excalidraw",
    "Assets",
  ];
}

/** Default cutoff for dailies: one year ago (ISO date). Dailies older than
 *  this are skipped from extraction. Computed lazily so tests can mock Date. */
export function defaultDailiesFromIso(now: Date = new Date()): string {
  const d = new Date(now);
  d.setFullYear(d.getFullYear() - 1);
  return d.toISOString().slice(0, 10);
}
