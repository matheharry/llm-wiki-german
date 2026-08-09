# Changelog

All notable changes to LLM Wiki are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.1.1] — 2026-08-09

### Added
- **Chunking for long files**: files longer than the extraction character
  limit are now split into multiple chunks and extracted separately instead
  of being truncated. This preserves information from the whole document.
  New settings: "Chunking aktivieren", "Maximale Chunks pro Datei", and
  "Chunk-Überlappung (Zeichen)". Chunking is on by default; disable it to
  restore the legacy truncate-at-limit behaviour.

## [1.0.1] — 2026-04-11

### Added
- **Mistral** as a built-in LLM provider. (#1, thanks @StefKors)
- **Multi-folder index**: pick one or more vault folders to include in the
  knowledge base. If none are picked, the whole vault is used.
  (#4, thanks @StefKors)
- **Custom OpenAI-compatible provider**: configure your own base URL, API
  key, and model to use any OpenAI-compatible endpoint. (#6, thanks @StefKors)
- **Extraction output language** setting, including Dutch.
  (#7, thanks @StefKors)
- Content-based extraction dedupe using SHA-256 hashes. Replaces the
  previous modification-time check, which could re-extract unchanged notes
  when iCloud touched file timestamps.

### Changed
- Extraction now respects the folder scope set for queries. Previously it
  ran against the whole vault regardless of your folder selection.
  (#5, thanks @StefKors)
- Multi-folder settings UI restyled to match Obsidian's native look.
- README: reframed features into three buckets and expanded the manual
  install instructions.

### Fixed
- Model/folder picker popover: clipping at screen edges, missing selection
  checkmark, long-name truncation, and toggle behavior.

## [1.0.0] — 2026-04-10

Initial public release.
