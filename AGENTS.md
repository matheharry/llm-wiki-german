# AGENTS.md

German-language Obsidian plugin (desktop-only, `isDesktopOnly: true`) that turns vault notes into a queryable LLM knowledge base. Fork of `domleca/llm-wiki` (`upstream` remote); packaged as an Obsidian community plugin.

## Commands

```bash
npm run build      # production bundle → main.js (minified, no sourcemap)
npm run dev        # esbuild watch mode, never exits; one-off builds use: npm run build
npm run test       # vitest run (all tests)
npm run test:watch # vitest watch
npm run lint       # eslint . (type-aware; needs tsconfig.json)
npm run typecheck  # tsc --noEmit
```

CI order (`.github/workflows/ci.yml`): `typecheck` → `lint` → `test` → `build`. Run all four after changes. For a single test: `npx vitest run tests/<path>.test.ts`.

- `main.js` is gitignored and always generated from `main.ts` (the only entrypoint; it re-exports `LlmWikiPlugin` from `src/plugin.ts`).
- Live testing in a real vault: set `LLM_WIKI_TESTVAULT=<vault>` before `npm run dev` — esbuild copies `main.js`/`manifest.json`/`styles.css` into `<vault>/.obsidian/plugins/llm-wiki-german/` and watches `styles.css` separately.

## Architecture

- ESM (`type: module`); every relative import uses a `.js` extension (`from "./core/kb.js"`). Match this convention.
- `src/plugin.ts` is the plugin class and wiring hub (settings, KB, provider, commands, events, status bar). Sub-packages: `core` (domain models, lint, dedupe), `extract` (theory), `query` (retrieval + RRF), `llm` (providers), `pages` (OKF markdown generation), `ui`, `vault` (all persistence), `runtime` (watcher/scheduler/progress), `chat`.
- Generated data lives under `wiki/` in the vault, never touching user notes. KB store = `wiki/knowledge.json` (NOT `kb.json`), wiki log = `wiki/log.md`. Historical docs may mention `kb.json`/`wiki-log.md` — the code uses `knowledge.json`/`log.md`.
- Defaults: Ollama at `localhost:11434`, model `gemma4:e4b-it-qat`, embeddings `embeddinggemma:latest` (`EMBEDDING_MODEL` in `src/query/embeddings.ts`). Extraction truncates long notes to `extractionCharLimit` (default 12000) and chunked long-file extraction was recently added.
- Generated pages follow OKF v0.2 (`SPEC.md`): YAML frontmatter with `type`, `title`, `description`, `sources`, `generated`, `status`.

## Enforced rules

- **All vault writes must go through `src/vault/safe-write.ts`.** A custom lint rule (`local-rules/no-direct-vault-write`, an `error`) blocks direct `app.vault.create/modify/delete/write/writeBinary/trash` and `adapter`/`fileManager` calls outside `src/vault/`. Do not bypass it.
- ESLint is type-aware (`parserOptions.project`); `no-unused-vars` allows `_`-prefixed names. Vital display strings, commands, settings, and prompts are German — keep that convention.

## Testing

- Vitest, `environment: "node"`; the `obsidian` module is aliased to `tests/helpers/obsidian-stub.ts` — no real Obsidian API is needed.
- Tests mirror `src/` layout under `tests/`; integration suites in `tests/integration/`; property tests use `fast-check` (`.test.ts` files ending in `*.property.test.ts`).
- Mocks: `tests/helpers/mock-app.ts`, `mock-llm-provider.ts`, `mock-fetch.ts`. Hand-curated fixture KB: `tests/fixtures/sample-kb.json` (edit by hand when new shapes are needed).
- Coverage thresholds exist in `vitest.config.ts` but `npm test` and CI do NOT run coverage.

## Gotchas

- `.clinerules/` is for Cline, but should be be followed by OpenCode too.
- Init work that must not block startup goes inside `app.workspace.onLayoutReady`; embedding index builds after an initial `PREBUILD_DELAY_MS` (2000).
- When iterating listener `Set`s, snapshot before iterating — callbacks re-subscribe and the loop would otherwise never end.
- `saveKB`/`loadKB` use an mtime concurrency guard (`KBStaleError`) — keep passing/refreshing the KB mtime through the save/load cycle.
- No telemetry; default provider is local. Anthropic has no embeddings API → the plugin injects an Ollama embed provider as fallback.
- Release: pushing a tag triggers `.github/workflows/release.yml` (builds and attaches `main.js` `manifest.json` `styles.css`). Keep all three in sync on version bumps.