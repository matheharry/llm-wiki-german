# Memory Bank — LLM Wiki German

> Persistent project context for the LLM Wiki German Obsidian plugin.
> This file captures the architectural overview, key implementation details,
> data models, and development conventions. Read this first when resuming work.

---

## 1. Project Overview

**LLM Wiki German** is a local-first, LLM-powered knowledge base for Obsidian. It transforms unstructured notes into a structured, queryable wiki and provides a grounded chat interface.

- **Fork lineage:** Fork of [domleca/llm-wiki](https://github.com/domleca/llm-wiki), heavily adapted for the German language (German prompts, UI, default models). Upstream remote: `domleca/llm-wiki`.
- **Purpose:** Extract entities, concepts, and connections from notes; answer questions in natural language with sources.
- **Core Tech:** TypeScript, Obsidian API, LLMs (Ollama, OpenAI, Anthropic, Gemini, Mistral, LlamaCpp, OpenAI-compatible).
- **Format:** Open Knowledge Format (OKF) v0.2 — see `SPEC.md`.
- **Privacy:** Local-first. Default provider is Ollama (everything stays local). Cloud providers are opt-in.
- **Package name:** `llm-wiki-de-plugin`, version `1.1.0b`.

### Distinctive Features (beyond upstream)

- OKF v0.2 conformity
- **Mistral** and **LlamaCpp** as integrated providers
- **OpenAI-compatible provider** (any compatible endpoint, e.g. LM Studio, vLLM)
- Configurable extraction language (German, English, French, Spanish, Italian, Dutch, Portuguese)
- **Multi-folder index** (`queryFolders` setting)
- **Content-based deduplication** via SHA-256 hashes
- **Integrity linting** of the KB with auto-repair
- **Wiki log** (`wiki/wiki-log.md`) and **interaction log** (questions/answers)
- **Welcome modal** for first-time setup
- German default skip directories (e.g. "Vorlagen")

---

## 2. Architecture & Directory Structure

### `src/` layout

| Directory | Responsibility |
|---|---|
| `src/core` | Domain models: `KnowledgeBase`, `Entity`, `Concept`, `Connection`, `SourceRecord`, `KBData`; ID generation, dedupe, filters, lint, OKF types, vocabulary. |
| `src/extract` | Extraction pipeline: `Queue`, `Extractor`, `Prompts`, `Parsers`, content hashing, defaults. |
| `src/query` | Retrieval engine: hybrid search (keywords + embeddings + path), RRF fusion, classification, confidence, grounding, folder scope, format-context. |
| `src/llm` | `LLMProvider` abstraction + concrete providers: Ollama, OpenAI, Anthropic, Google, Mistral, LlamaCpp. Provider catalog, API-key detection. |
| `src/pages` | Automated markdown page generation for KB items (entities, concepts, sources, index), frontmatter handling. |
| `src/ui` | Obsidian-specific UI: Query modal, Welcome modal, Lint modal, Vocabulary modal, Settings tab, Status bar. |
| `src/vault` | Storage: KB store (`wiki/kb.json`), interaction log, wiki log, plugin data, embeddings cache, path scope, safe write, vault walker. |
| `src/runtime` | On-save watcher, progress emitter, nightly scheduler. |
| `src/chat` | Chat history, persistence, model context, title generation, rewrite, types. |

### Entry point

- **`src/plugin.ts`** — `LlmWikiPlugin extends Plugin`. Owns `settings`, `kb`, `progress`, `provider`, `chats`, `embeddingsCache`, `embeddingIndexController`. Registers commands, events, status bar, settings tab, ribbon icon.

---

## 3. Data Model (`src/core/types.ts`)

Pure data types shared with a Python CLI (`knowledge.json` is the source of truth).

### Entity
```ts
{
  id: string;          // slugified via makeId()
  name: string;
  type: EntityType;    // "person" | "org" | "tool" | "project" | "book" | "article" | "place" | "event" | "other"
  aliases: string[];
  facts: string[];
  sources: string[];   // source paths
}
```

### Concept
```ts
{
  id: string;
  name: string;
  definition: string;
  related: string[];
  sources: string[];
}
```

### Connection
```ts
{
  from: string;   // entity id
  to: string;     // entity id
  type: ConnectionType; // "influences" | "uses" | "critiques" | "extends" | "part-of" | "created-by" | "related-to" | "applies-to" | "contrasts-with"
  description: string;
  sources: string[];
}
```

### SourceRecord
```ts
{
  id: string;             // source file path
  summary: string;
  date: string;           // ISO date
  mtime: number;
  contentHash?: string;   // SHA-256 hex, primary dedupe key
  origin: SourceOrigin;   // "user-note" | "promoted" | "daily"
}
```

### KBData
```ts
{
  meta: { version, created, updated };
  entities: Record<string, Entity>;
  concepts: Record<string, Concept>;
  connections: Connection[];
  sources: Record<string, SourceRecord>;
}
```

### OKF types
- `OKFTrustTier`: "unverified" | "machine-confirmed" | "human-reviewed"
- `OKFStatus`: "draft" | "stable" | "deprecated"
- `OKFFrontmatter`: type, title, description, resource, tags, status, stale_after, generated, verified, sources, usage_window, okf_version, `[key: string]: unknown`

---

## 4. Knowledge Base (`src/core/kb.ts`)

`KnowledgeBase` class wraps `KBData` with methods:

- **`addEntity` / `addConcept`** — slugify name to id; merge if exists (dedupe aliases/facts/sources).
- **`addConnection`** — dedupe by (from, to, type); merge sources.
- **`markSource`** — upsert source record; assigns `contentHash` if provided.
- **`needsExtraction(path, currentMtime, currentContentHash)`** — key dedupe logic:
  - **Primary:** stored `contentHash` vs current — re-extract iff differs. Immune to mtime drift (iCloud re-sync, clock skew, ms vs s).
  - **Secondary (pre-migration):** no stored hash → mtime comparison. Backfilled on first skip.
- **`backfillContentHash`** — populates `contentHash` for pre-hash entries, upgrades stored mtime.
- **`removeSource`** — deletes source; prunes entities/concepts with no remaining sources; drops connections with no sources.
- **`renameSource`** — updates source id and all references.
- **`connectionsFor(nameOrId)`**, **`stats()`**, **`allEntities/allConcepts/allConnections/allSources`**, **`getEntity` (by id or alias)**, **`getConcept`**.
- **`sanitizeKbData`** — coerces malformed non-string values from old plugins/Python CLI to valid strings.

---

## 5. Extraction Pipeline (`src/extract/`)

### Flow (`src/extract/queue.ts`)
1. Emit `batch-started`.
2. For each file: check `kb.needsExtraction(...)` → skip if up-to-date (and backfill hash).
3. `extractFile(...)` → parses LLM response into KB mutations.
4. Checkpoint save every N successful files (default 5) via provided `saveKB` closure.
5. Final save on success or cancellation.
6. Emits `file-started/completed/failed`, `checkpoint`, `batch-completed/cancelled/errored`.

### Key facts
- **SHA-256 content hashing**: `src/extract/content-hash.ts`.
- **Char limit**: default `12_000` chars; truncates long files before prompting.
- **Language setting**: `extractionOutputLanguage` (`app` / `en` / `fr` / `es` / `de` / `it` / `nl` / `pt`). `describeExtractionLanguage()` resolves "app" to Obsidian UI language.
- Cancellation: `AbortSignal` → clean exit at file boundary (throws `LLMAbortError`).
- `KBStaleError` (from `vault/kb-store.ts`) — aborts batch if KB changed externally (mtime mismatch).
- Extraction temperature 0.1, numCtx 8192 (ported from Python).

---

## 6. Retrieval & Ranking (`src/query/`)

### `retrieve.ts` — hybrid search via Reciprocal Rank Fusion (RRF)
1. **`extractQueryTerms(question)`** → keyword terms.
2. **`classifyQuery(question)`** → `QueryType`: `entity_lookup` | `list_category` | `relational` | `conceptual`.
3. Three rankers, each returning `RankedItem[]`:
   - `rankByKeyword` — BM25-style frequency.
   - `rankByEmbedding` — vector similarity (semantic).
   - `rankByPath` — vault structure / query terms in paths.
4. **RRF fusion** (`rrfFuse`) with per-query-type weights:
   ```ts
   entity_lookup: [2.0, 0.5, 0.3]
   list_category: [0.8, 0.8, 1.5]
   relational:    [1.0, 1.2, 0.5]
   conceptual:    [0.8, 1.5, 0.5]
   ```
   `RRF_K = 60`.
5. **Quality multipliers** (`quality.ts`) + **type hint boost** (`TYPE_HINT_BOOST = 2.5`) when query hints an entity type.
6. Filter blacklists (`RETRIEVAL_ENTITY_BLACKLIST`, `RETRIEVAL_CONCEPT_BLACKLIST`) — main lever to stop query-time garbage.
7. Caps: `MAX_ENTITIES = 12`, `MAX_CONCEPTS = 8`.
8. Gather connections touching selected entities; gather source records for surviving items.
9. **`filterBundleByFolder`** — restricts results to configured `queryFolders`.

### Other query modules
- `ask.ts` — streamed chat answer with grounding; `ground-sources.ts` — link answers to sources; `confidence.ts`; `format-context.ts`; `classify.ts`; `terms.ts`; `folder-scope.ts`.
- `embeddings.ts` — builds embedding index (`EMBEDDING_MODEL` const, default `qllama/multilingual-e5-base`); `embedding-index-controller.ts` — async build with progress and staleness; `embedding-ranker.ts`; `embedding-text.ts`.

---

## 7. LLM Provider Layer (`src/llm/`)

### `provider.ts` — abstraction seam
```ts
interface LLMProvider {
  complete(opts: CompletionOptions): AsyncIterable<string>;
  embed(opts: EmbedOptions): Promise<number[]>;
  ping(signal?: AbortSignal): Promise<boolean>;
  showModel(model: string): Promise<{ contextLength: number | null }>;
  listModels?(): Promise<string[] | null>;
}
```

### Error hierarchy
- `LLMError` (base) → `LLMHttpError` (has `status`) → `LLMConnectError` (fetch failed, no response) → `LLMProtocolError` (bad response body) → `LLMAbortError` (caller aborted).

### Concrete providers
| Provider | Notes |
|---|---|
| `ollama.ts` | Local, default. URL `http://localhost:11434`. |
| `openai.ts` | OpenAI API + custom OpenAI-compatible base URLs (`/v1/chat/completions`, `/v1/embeddings`, `/v1/models`). |
| `anthropic.ts` | No embedding API → **injects an Ollama embed-provider** (`embedProvider: ollama`). |
| `google.ts` | Gemini models. |
| `mistral.ts` | Ministral models + mistral-embed. |
| `llama-cpp.ts` | Local alternative backend. |

- `catalog.ts` — `completionModels()`, `defaultCompletionModel()`, `defaultEmbeddingModel()`, `CloudProvider` type.
- `detect-key.ts` — API key detection helper.

### Provider selection (`plugin.ts::rebuildProvider`)
- Switch on `settings.providerType`; falls back to Ollama when no API key is configured for the chosen cloud provider.
- `activeModel` / `activeEmbeddingModel` getters resolve the correct model per provider type.

---

## 8. Pages Generation (`src/pages/`)

- `generator.ts` — `generatePages(app, kb)` writes `wiki/entities/`, `wiki/concepts/`, `wiki/sources/`, `wiki/index.md`; returns `{ written, deleted }`. `sourcePagePath(path)` maps source → page path.
- `frontmatter.ts` — OKF frontmatter serialization (+ property test).
- `render-entity.ts`, `render-concept.ts`, `render-source.ts`, `render-index.ts` — page renderers.
- `safe-write.ts` (in `vault/`) — atomic/safe writes and page deletion.

---

## 9. Vault Storage (`src/vault/`)

- **`kb-store.ts`** — `loadKB` / `saveKB` with mtime-based concurrency guard. Throws `KBStaleError` on mismatch. Main data: `wiki/kb.json` (note: README says `knowledge.json`, code/docs may differ — verify actual filename on disk).
- **`plugin-data.ts`** — `loadEmbeddingsCache` / `saveEmbeddingsCache` (`EmbeddingsCache`).
- **`interaction-log.ts`** — appends `{ question, answer, model, queryType, entityCount, conceptCount, elapsedMs }`.
- **`wiki-log.ts`** — appends to `wiki/wiki-log.md`.
- **`walker.ts`** — `walkVaultFiles(app, { skipDirs, includeFolders, minFileSize, dailiesFromIso })` → `WalkOptions` / files with `origin`.
- **`path-scope.ts`**, **`safe-write.ts`**.

---

## 10. Runtime (`src/runtime/`)

- **`on-save-watcher.ts`** — debounced re-extraction after file save; respects skip dirs, included folders, `isExtractionRunning`.
- **`scheduler.ts`** — nightly extraction (`nightlyExtractionHour`, default 2 AM); missed-run catch-up.
- **`progress.ts`** — `ProgressEmitter` event bus (`batch-started`, `file-started`, `file-completed`, `file-failed`, `file-skipped`, `checkpoint`, `batch-completed`, `batch-cancelled`, `batch-errored`).

---

## 11. Plugin Lifecycle (`src/plugin.ts`)

### Settings (`LlmWikiSettings`)
- `version`, `providerType`, `apiKeys`, custom OpenAI endpoints/config, `ollamaUrl`, `ollamaModel` (`gemma4:e4b-it-qat`), `ollamaEmbeddingModel` (`qllama/multilingual-e5-base:latest`), `ollamaNumCtx` (8192), LlamaCpp config, `cloudModel`, `extractionOutputLanguage`, `extractionCharLimit` (12000), `lastExtractionRunIso`, `queryFolders`, `nightlyExtractionEnabled/Hour`, `showStatusBar`, `hideWikiFromSearch`.
- Migrations: `defaultQueryFolder` → `queryFolders`; old `cloudModel` → `customOpenAIModel` for openai-compatible.

### Commands
- **Wissensdatenbank abfragen** (run-query)
- **Extrahierung starten** (extract-all)
- **aktuelle Datei extrahieren** (extract-current)
- **laufende Extrahierung abbrechen** (extract-cancel)
- **Seiten aus Wissensdatenbank neu generieren** (regenerate-pages)
- **Wissensdatenbank von der Festplatte neu laden** (reload-kb)
- **Wissensdatenbank aufräumen und prüfen** (lint-kb)

### Key events
- Vault `delete` / `rename` → update KB, save, regenerate pages, (delete old source page on rename).
- Vault `modify` → on-save watcher triggers current-file extraction.
- `app.workspace.onLayoutReady` → start scheduler, show welcome if needed.
- `PREBUILD_DELAY_MS = 2000` → background embedding index build after load.

### Utilities
- `applySearchExclusion()` — toggles `wiki/` in `userIgnoreFilters` (app.json via undocumented `vault.getConfig/setConfig`).
- `setRunning()` — snapshots listeners before iterating to avoid infinite loop on re-subscribe.
- `activeModel` — resolves model; validates against `completionModels(provider)`.

---

## 12. Chat (`src/chat/`)

- `types.ts` — `Chat` type.
- `persistence.ts` — `loadChats` / `saveChats`.
- `store.ts`, `title.ts` (auto-title), `rewrite.ts`, `model-context.ts`, `history-budget.ts` (context window budgeting), `id.ts`.

---

## 13. Development Workflow

### Commands
| Command | Purpose |
|---|---|
| `npm install` | Install dependencies |
| `npm run build` | Production build → `main.js` |
| `npm run dev` | Dev build with watch |
| `npm test` | Vitest suite (unit, integration, property) |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |

### Testing strategy
- **Unit tests** in `tests/` mirroring `src/`.
- **Integration tests** in `tests/integration/`: `chat-flow.test.ts`, `phase2-extraction.test.ts`, `phase3-query.test.ts`, `phase4-pages.test.ts`.
- **Property-based tests** with `fast-check`: `tests/core/ids.property.test.ts`, `tests/extract/parser.property.test.ts`, `tests/pages/frontmatter.property.test.ts`.
- **Mocks**: `tests/helpers/mock-app.ts` (Obsidian API), `tests/helpers/mock-llm-provider.ts` (+ `.embed.test.ts`), `tests/helpers/mock-fetch.ts`, `tests/helpers/obsidian-stub.ts`.
- **Fixtures**: `tests/fixtures/sample-kb.json`, `tests/fixtures/raw-llm-responses/`.

### Tooling
- Bundle: `esbuild.config.mjs`; lint: `eslint.config.mjs`; TS: `tsconfig.json`; test: `vitest.config.ts`.
- `tests/helpers/validate-bases.ts` — validates generated pages against Obsidian Bases format.

---

## 14. Conventions & Gotchas

- **Strict TypeScript** — must pass `npm run typecheck`.
- **Local-first** — prioritize Ollama as default provider.
- **Surgical edits** — use replace / targeted write, not rewrites.
- **Verification** — always run `npm test` after changes.
- **Obsidian event loop** — use `app.workspace.onLayoutReady` for non-blocking startup init.
- **ESM**: package `type: module`, imports use `.js` extensions (`import ... from "./core/kb.js"`).
- **Undocumented Obsidian API**: `vault.getConfig/setConfig` used for `userIgnoreFilters` — guard with `typeof check`.
- **German-first UX**: commands, notices, and prompts are in German — keep that convention.
- **KB concurrency**: `saveKB`/`loadKB` use mtime guard; always pass `this.kbMtime` and refresh it after save via `loadKB`.
- **Snapshot listeners** before iterating (`Set` can re-subscribe during iteration → infinite loop).

---

## 15. Current Task / Flow Notes

- Latest commit: `0d637ec6` (per workspace info).
- Remotes: `origin` = `mathcharry/llm-wiki-german`, `upstream` = `domleca/llm-wiki`.
- Task in progress: **Initialize memory bank** — this file documents the project for ongoing work.