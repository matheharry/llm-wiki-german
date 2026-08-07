# LLM Wiki Plugin

A local-first, LLM-powered knowledge base for Obsidian. It extracts entities, concepts, and connections from notes and provides a grounded chat interface.

## Project Overview

- **Purpose:** Transform unstructured Obsidian notes into a structured, queryable wiki.
- **Core Technology:** TypeScript, Obsidian API, LLMs (Ollama, OpenAI, Anthropic, Gemini, Mistral).
- **Open Knowledge Format (OKF):** based on SPEC.md
- **Architecture:**
  - `src/core`: Domain models (KnowledgeBase, Entity, Concept, Connection).
  - `src/extract`: Extraction pipeline (Queue, Extractor, Prompts, Parsers).
  - `src/query`: Retrieval engine (Hybrid search: Keywords + Embeddings + Path, RRF fusion).
  - `src/llm`: Provider abstractions for different LLM backends.
  - `src/pages`: Automated markdown page generation for KB items.
  - `src/ui`: Obsidian-specific UI (Modals, Settings, Status Bar).
  - `src/vault`: Storage management (KB JSON, interaction logs, embeddings cache).

## Development Workflow

### Building and Running
- `npm install`: Install all dependencies.
- `npm run build`: Production build (bundled to `main.js`).
- `npm run dev`: Development build with watch mode.
- `npm test`: Execute the Vitest test suite (includes unit, integration, and property tests).
- `npm run lint`: Run ESLint to ensure code quality.
- `npm run typecheck`: Run `tsc` to verify type safety.

### Testing Strategy
- **Unit Tests:** Located in `tests/` mirroring the `src/` structure.
- **Integration Tests:** Found in `tests/integration/` (e.g., `chat-flow.test.ts`, `phase2-extraction.test.ts`).
- **Property-based Tests:** Uses `fast-check` (e.g., `tests/core/ids.property.test.ts`).
- **Mocks:** Extmemory-bank.mdensive use of mocks for Obsidian API (`tests/helpers/mock-app.ts`) and LLM providers.

## Key Implementation Details

### Extraction Logic (`src/extract/extractor.ts`)
- Uses LLM prompts to extract entities (people, orgs, etc.) and concepts from note content.
- Employs SHA-256 content hashes to skip re-extracting unchanged files.
- Truncates long files to a configurable character limit (default 12,000) for LLM efficiency.

### Retrieval & Ranking (`src/query/retrieve.ts`)
- Implements hybrid search using **Reciprocal Rank Fusion (RRF)**.
- Combines:
  - **Keyword Ranker:** BM25-style frequency matching.
  - **Embedding Ranker:** Vector similarity (Semantic search).
  - **Path Ranker:** Boosts results based on vault structure and query terms in paths.
- Adjusts scores based on quality multipliers and type hints detected in the query.

### Knowledge Base Storage (`src/vault/kb-store.ts`)
- The main data is stored in `wiki/kb.json` within the vault.
- Automatically generates markdown pages in `wiki/entities/`, `wiki/concepts/`, and `wiki/sources/`.
- Updates the KB on file save (via `OnSaveWatcher`) or through scheduled nightly runs.

## Development Conventions

- **Strict TypeScript:** All code must pass `npm run typecheck`.
- **Local-First:** Prioritize Ollama (local LLM) as the default provider.
- **Surgical Edits:** Use `replace` or targeted `write_file` when modifying existing files.
- **Verification:** Always run `npm test` after changes. For features involving LLM responses, consider adding/updating relevant mocks in `tests/fixtures/`.
- **Obsidian API:** Be mindful of Obsidian's event loop; use `app.workspace.onLayoutReady` for initialization tasks that shouldn't block startup.
