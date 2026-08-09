import type { KnowledgeBase } from "../core/kb.js";
import type { LLMProvider } from "../llm/provider.js";
import { LLMAbortError } from "../llm/provider.js";
import type { ProgressEmitter } from "../runtime/progress.js";
import { KBStaleError } from "../vault/kb-store.js";
import { extractFile, type ExtractFileInput } from "./extractor.js";
import { deduplicateEntityFacts } from "../core/dedupe.js";
import { wordSimilarity } from "../core/lint.js";
import { exportVocabulary } from "../core/vocabulary.js";
import { sha256Hex } from "./content-hash.js";

export type QueueFile = ExtractFileInput;

export interface RunExtractionArgs {
  provider: LLMProvider;
  kb: KnowledgeBase;
  files: QueueFile[];
  model: string;
  /** Persists the KB to disk. Implementation supplies this — typically a
   *  closure around `saveKB(app, kb, mtime)` that updates its captured
   *  mtime on success. */
  saveKB: () => Promise<void>;
  emitter: ProgressEmitter;
  /** Checkpoint every N successful files. Defaults to 5. */
  checkpointEvery?: number;
  /** Truncate file content at this many characters before prompting. */
  charLimit?: number;
  /** Language to request for extracted summaries/facts/definitions. */
  outputLanguage?: string;
  /** Cancellation signal. If it fires, the queue exits cleanly at the next
   *  file boundary. */
  signal?: AbortSignal;
  /**
   * Number of files to process in parallel. Defaults to 1 (serial).
   * Set to 3–4 for local Ollama setups; keep at 1 for rate-limited
   * cloud providers unless you've verified their throughput limits.
   */
  concurrency?: number;
}

export interface RunExtractionStats {
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
  elapsedMs: number;
}

export async function runExtraction(
  args: RunExtractionArgs,
): Promise<RunExtractionStats> {
  const { provider, kb, files, model, saveKB, emitter, charLimit } = args;
  const checkpointEvery = args.checkpointEvery ?? 5;
  const concurrency = Math.max(1, args.concurrency ?? 1);
  const total = files.length;
  const t0 = Date.now();

  // Shared mutable counters — safe in single-threaded JS since all mutations
  // happen synchronously between await points.
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;
  let processedSinceCheckpoint = 0;
  let checkpointSaving = false;
  let batchErrorMessage: string | null = null;

  // Entity names touched this run — fed into post-batch deduplication.
  const pendingDedup = new Set<string>();

  // Shared file cursor — workers atomically grab the next index.
  let fileIndex = 0;
  let progressIndex = 0;

  // Freeze the vocabulary once before workers start so every file in this
  // batch uses the same KB snapshot. This avoids O(n²) re-exports and
  // keeps the prompt size constant across the run.
  const frozenVocabulary = exportVocabulary(kb);

  emitter.emit("batch-started", { total });

  const isCancelled = (): boolean => args.signal?.aborted === true;
  const isStopped = (): boolean => isCancelled() || batchErrorMessage !== null;

  // ---------------------------------------------------------------------------
  // Checkpoint helper — only one concurrent save at a time.
  // ---------------------------------------------------------------------------
  async function maybeCheckpoint(currentIndex: number): Promise<void> {
    if (processedSinceCheckpoint < checkpointEvery || checkpointSaving) return;
    // Synchronously claim the lock before the first await.
    checkpointSaving = true;
    try {
      await saveKB();
      emitter.emit("checkpoint", { processed: currentIndex, total });
      processedSinceCheckpoint = 0;
    } catch (e) {
      batchErrorMessage =
        e instanceof KBStaleError
          ? `KB changed externally during extraction (expected mtime ${e.expectedMtime}, actual ${e.actualMtime}). Re-run the command to continue.`
          : ((e as Error).message ?? "Unknown error");
      emitter.emit("batch-errored", { message: batchErrorMessage });
    } finally {
      checkpointSaving = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Worker — each worker loops until there are no more files or we must stop.
  // ---------------------------------------------------------------------------
  async function worker(): Promise<void> {
    while (!isStopped()) {
      // Atomically grab the next file index (synchronous — no race in JS).
      const i = fileIndex++;
      if (i >= total) break;

      const file = files[i];
      const index = ++progressIndex;

      // Fast check 1: If caller provided an explicit contentHash (e.g. tests), check it directly.
      // Otherwise, use fast mtime pre-check (0 disk reads, 0 hashing for unmodified files).
      if (file.contentHash !== undefined && file.contentHash.length > 0) {
        if (!kb.needsExtraction(file.path, file.mtime, file.contentHash)) {
          kb.backfillContentHash(file.path, file.contentHash, file.mtime);
          skipped++;
          emitter.emit("file-skipped", { path: file.path, index, total, reason: "Inhalt unverändert (Hash-Übereinstimmung)" });
          continue;
        }
      } else if (!kb.needsExtractionFast(file.path, file.mtime)) {
        const cachedHash = kb.data.sources[file.path]?.contentHash ?? "";
        kb.backfillContentHash(file.path, cachedHash, file.mtime);
        skipped++;
        emitter.emit("file-skipped", { path: file.path, index, total, reason: "Inhalt unverändert (mtime-Vorprüfung)" });
        continue;
      }

      // Fast check 2: file modified or unknown -> load content on-demand and compute hash
      const content =
        file.content ?? (file.getContent ? await file.getContent() : "");
      const contentHash =
        file.contentHash ?? (await sha256Hex(content));

      if (!kb.needsExtraction(file.path, file.mtime, contentHash)) {
        kb.backfillContentHash(file.path, contentHash, file.mtime);
        skipped++;
        emitter.emit("file-skipped", { path: file.path, index, total, reason: "Inhalt unverändert (vollständige Hash-Prüfung)" });
        continue;
      }

      emitter.emit("file-started", { path: file.path, index, total });
      const preEntities = kb.stats().entities;
      const preConcepts = kb.stats().concepts;

      try {
        const result = await extractFile({
          provider,
          kb,
          file,
          model,
          outputLanguage: args.outputLanguage,
          signal: args.signal,
          charLimit,
          vocabulary: frozenVocabulary,
          resolvedContent: content,
          resolvedContentHash: contentHash,
        });

        if (result) {
          const stats = kb.stats();
          succeeded++;
          processedSinceCheckpoint++;

          // Collect entity names for the post-batch deduplication pass.
          for (const ent of result.entities) {
            const name = (ent.name ?? "").trim();
            if (name) pendingDedup.add(name);
          }

          emitter.emit("file-completed", {
            path: file.path,
            index,
            total,
            entitiesAdded: stats.entities - preEntities,
            conceptsAdded: stats.concepts - preConcepts,
          });

          await maybeCheckpoint(index);
        } else {
          failed++;
          emitter.emit("file-failed", {
            path: file.path,
            index,
            total,
            reason: "LLM response could not be parsed",
          });
        }
      } catch (e) {
        if (e instanceof LLMAbortError || isCancelled()) break;
        failed++;
        const reason = (e as Error).message ?? "Unknown error";
        emitter.emit("file-failed", { path: file.path, index, total, reason });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Launch parallel workers and wait for all to finish.
  // ---------------------------------------------------------------------------
  const workerCount = Math.min(concurrency, total || 1);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  // ---------------------------------------------------------------------------
  // Post-batch deduplication — runs after all extraction workers are done,
  // so the KB is fully settled before we look for redundant facts.
  // Only runs when the batch completed normally (no abort / no batch error).
  // ---------------------------------------------------------------------------
  if (!isStopped() && pendingDedup.size > 0) {
    emitter.emit("dedup-started", { total: pendingDedup.size });
    await runBatchDeduplication({
      entityNames: pendingDedup,
      kb,
      provider,
      model,
      signal: args.signal,
      concurrency,
      emitter,
    });
  }

  // ---------------------------------------------------------------------------
  // Final save (unless a batch-error already stopped us).
  // ---------------------------------------------------------------------------
  if (!batchErrorMessage) {
    try {
      await saveKB();
    } catch (e) {
      const message =
        e instanceof KBStaleError
          ? `KB changed externally during extraction (expected mtime ${e.expectedMtime}, actual ${e.actualMtime}). Re-run the command to continue.`
          : ((e as Error).message ?? "Unknown error");
      emitter.emit("batch-errored", { message });
      return { total, succeeded, failed, skipped, elapsedMs: Date.now() - t0 };
    }
  }

  const elapsedMs = Date.now() - t0;

  if (isCancelled() && !batchErrorMessage) {
    emitter.emit("batch-cancelled", {
      processed: succeeded + failed,
      total,
    });
  } else if (!batchErrorMessage) {
    emitter.emit("batch-completed", {
      processed: succeeded + failed + skipped,
      succeeded,
      failed,
      skipped,
      total,
      elapsedMs,
    });
  }

  return { total, succeeded, failed, skipped, elapsedMs };
}

// =============================================================================
// Post-batch deduplication
// =============================================================================

interface BatchDedupArgs {
  entityNames: Set<string>;
  kb: KnowledgeBase;
  provider: LLMProvider;
  model: string;
  signal?: AbortSignal;
  concurrency: number;
  emitter: ProgressEmitter;
}

/**
 * Runs LLM-based fact deduplication for all entities touched during the
 * extraction batch. Executed *after* all files are processed so:
 *
 * 1. The full set of accumulated facts is visible before consolidation.
 * 2. No extra LLM call is interleaved with file extraction, keeping the
 *    hot extraction loop as fast as possible.
 * 3. Deduplication itself runs in parallel (same concurrency as extraction).
 *
 * Failures are non-fatal — the original facts are kept on error.
 */
async function runBatchDeduplication(args: BatchDedupArgs): Promise<void> {
  // Filter to entities that actually have similar facts worth deduplicating.
  const needsDedup = [...args.entityNames].filter((name) => {
    const ent = args.kb.getEntity(name);
    if (!ent || ent.facts.length < 2) return false;
    for (let i = 0; i < ent.facts.length; i++) {
      for (let j = i + 1; j < ent.facts.length; j++) {
        if (wordSimilarity(ent.facts[i]!, ent.facts[j]!) >= 0.4) return true;
      }
    }
    return false;
  });

  if (needsDedup.length === 0) return;

  let idx = 0;
  let done = 0;
  const total = needsDedup.length;

  async function dedupWorker(): Promise<void> {
    while (idx < total) {
      if (args.signal?.aborted) break;
      // Synchronously claim the next entity (no race in JS).
      const name = needsDedup[idx++];
      if (!name) break;
      const ent = args.kb.getEntity(name);
      if (!ent) continue;
      try {
        const cleanFacts = await deduplicateEntityFacts(
          args.provider,
          args.model,
          ent.name,
          ent.type,
          ent.facts,
          args.signal,
        );
        ent.facts = cleanFacts;
      } catch {
        // Non-fatal: keep original facts on error.
      }
      done++;
      args.emitter.emit("dedup-progress", { done, total });
    }
  }

  const workerCount = Math.min(args.concurrency, total);
  await Promise.all(Array.from({ length: workerCount }, () => dedupWorker()));
}
