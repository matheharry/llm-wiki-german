import { getLanguage, Notice, Plugin, TFile } from "obsidian";
import { KnowledgeBase } from "./core/kb.js";
import { loadKB, saveKB } from "./vault/kb-store.js";
import { walkVaultFiles, type WalkOptions } from "./vault/walker.js";
import { openVocabularyModal } from "./ui/modal/vocabulary-modal.js";
import { openLintModal } from "./ui/modal/lint-modal.js";
import { WelcomeModal } from "./ui/modal/welcome-modal.js";
import { OllamaProvider } from "./llm/ollama.js";
import { OpenAIProvider } from "./llm/openai.js";
import { AnthropicProvider } from "./llm/anthropic.js";
import { GoogleProvider } from "./llm/google.js";
import { MistralProvider } from "./llm/mistral.js";
import { LlamaCppProvider } from "./llm/llama-cpp.js";
import type { LLMProvider } from "./llm/provider.js";
import {
  completionModels,
  defaultCompletionModel,
  defaultEmbeddingModel,
  type CloudProvider,
} from "./llm/catalog.js";
import { runExtraction, type QueueFile } from "./extract/queue.js";
import { extractFile } from "./extract/extractor.js";
import { sha256Hex } from "./extract/content-hash.js";
import {
  DEFAULT_MIN_FILE_SIZE,
  defaultSkipDirs,
  defaultDailiesFromIso,
} from "./extract/defaults.js";
import { ProgressEmitter } from "./runtime/progress.js";
import { Scheduler } from "./runtime/scheduler.js";
import { OnSaveWatcher } from "./runtime/on-save-watcher.js";
import { StatusBarWidget } from "./ui/status-bar.js";
import { LlmWikiSettingsTab } from "./ui/settings/settings-tab.js";
import {
  loadEmbeddingsCache,
  saveEmbeddingsCache,
  type EmbeddingsCache,
} from "./vault/plugin-data.js";
import { appendInteractionLog } from "./vault/interaction-log.js";
import { loadChats, saveChats } from "./chat/persistence.js";
import type { Chat } from "./chat/types.js";
import { QueryModal } from "./ui/modal/query-modal.js";
import { buildEmbeddingIndex, EMBEDDING_MODEL } from "./query/embeddings.js";
import { EmbeddingIndexController } from "./query/embedding-index-controller.js";
import { generatePages, sourcePagePath } from "./pages/generator.js";
import { safeDeletePage } from "./vault/safe-write.js";
import { appendWikiLog } from "./vault/wiki-log.js";

/** Per-provider API keys, keyed by CloudProvider. */
export type ApiKeys = Partial<Record<CloudProvider, string>>;

export type ProviderType = "ollama" | "llama-cpp" | CloudProvider | "openai-compatible";
export type ExtractionLanguageSetting =
  | "app"
  | "en"
  | "fr"
  | "es"
  | "de"
  | "it"
  | "nl"
  | "pt";

interface LlmWikiSettings {
  version: number;
  /** Which backend to use for completion. */
  providerType: ProviderType;
  /** API keys for cloud providers. */
  apiKeys: ApiKeys;
  /** API key for custom OpenAI-compatible providers. */
  customOpenAIApiKey: string;
  /** Base URL for custom OpenAI-compatible providers. */
  customOpenAIBaseUrl: string;
  /** Models endpoint path or absolute URL for custom OpenAI-compatible providers. */
  customOpenAIModelsEndpoint: string;
  /** Completions endpoint path or absolute URL for custom OpenAI-compatible providers. */
  customOpenAICompletionsEndpoint: string;
  /** Embeddings endpoint path or absolute URL for custom OpenAI-compatible providers. */
  customOpenAIEmbeddingsEndpoint: string;
  /** Model name for custom OpenAI-compatible providers. */
  customOpenAIModel: string;
  /** Embedding model name for custom OpenAI-compatible providers. */
  customOpenAIEmbeddingModel: string;
  ollamaUrl: string;
  ollamaModel: string;
  ollamaEmbeddingModel: string;
  ollamaNumCtx: number;
  llamaCppUrl: string;
  llamaCppModel: string;
  llamaCppEmbeddingModel: string;
  llamaCppNumCtx: number;
  /** Model used when providerType is a preset cloud provider. */
  cloudModel: string;
  /** Output language used when extracting summaries, facts, and definitions. */
  extractionOutputLanguage: ExtractionLanguageSetting;
  extractionCharLimit: number;
  lastExtractionRunIso: string | null;
  queryFolders: string[];
  nightlyExtractionEnabled: boolean;
  nightlyExtractionHour: number;
  showStatusBar: boolean;
  hideWikiFromSearch: boolean;
  extractionConcurrency: number;
}

const DEFAULT_SETTINGS: LlmWikiSettings = {
  version: 1,
  providerType: "ollama",
  apiKeys: {},
  customOpenAIApiKey: "",
  customOpenAIBaseUrl: "",
  customOpenAIModelsEndpoint: "/v1/models",
  customOpenAICompletionsEndpoint: "/v1/chat/completions",
  customOpenAIEmbeddingsEndpoint: "/v1/embeddings",
  customOpenAIModel: "gpt-4o-mini",
  customOpenAIEmbeddingModel: "",
  ollamaUrl: "http://localhost:11434",
  ollamaModel: "gemma4:e4b-it-qat",
  ollamaEmbeddingModel: "embeddinggemma:latest",
  ollamaNumCtx: 8192,
  llamaCppUrl: "http://localhost:8080",
  llamaCppModel: "gemma-4-E4B_q4_0-it",
  llamaCppEmbeddingModel: "multilingual-e5-base-Q8_0",
  llamaCppNumCtx: 8192,
  cloudModel: "",
  extractionOutputLanguage: "app",
  extractionCharLimit: 12_000,
  lastExtractionRunIso: null,
  queryFolders: [],
  nightlyExtractionEnabled: false,
  nightlyExtractionHour: 2,
  showStatusBar: true,
  hideWikiFromSearch: true,
  extractionConcurrency: 3,
};

/** Delay before kicking off the background pre-build, so plugin load stays snappy. */
const PREBUILD_DELAY_MS = 2000;

export default class LlmWikiPlugin extends Plugin {
  settings: LlmWikiSettings = DEFAULT_SETTINGS;
  kb: KnowledgeBase = new KnowledgeBase();
  kbMtime = 0;

  progress = new ProgressEmitter();
  provider: LLMProvider = new OllamaProvider({
    url: this.settings.ollamaUrl,
    numCtx: this.settings.ollamaNumCtx,
  });
  /**
   * In-memory cache of the last key validation result per provider.
   * Not persisted — re-validated on each key change. Used by the settings
   * UI to show green/red status without a separate "Test" button.
   */
  keyValidationCache: Partial<Record<CloudProvider, { valid: boolean; error: string | null }>> = {};
  private abortController: AbortController | null = null;
  private running = false;
  private extractionStateListeners = new Set<() => void>();

  onExtractionStateChange(listener: () => void): () => void {
    this.extractionStateListeners.add(listener);
    return () => this.extractionStateListeners.delete(listener);
  }

  private setRunning(value: boolean): void {
    if (this.running === value) return;
    this.running = value;
    // Snapshot listeners before iterating: a listener may unsubscribe itself
    // and subscribe a fresh one (e.g. the settings tab re-renders on state
    // change, which re-binds its listener). `Set` iteration visits entries
    // added during the loop, so without a snapshot this loops forever and
    // freezes Obsidian the moment extraction starts.
    const snapshot = Array.from(this.extractionStateListeners);
    for (const l of snapshot) {
      try {
        l();
      } catch {
        /* ignore */
      }
    }
  }
  private chats: Chat[] = [];
  private embeddingsCache: EmbeddingsCache | null = null;
  private embeddingIndexController: EmbeddingIndexController | null = null;
  private prebuildTimer: number | null = null;
  private statusBarEl: HTMLElement | null = null;
  private scheduler: Scheduler | null = null;
  private onSaveWatcher: OnSaveWatcher | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.rebuildProvider();
    this.applySearchExclusion();
    try {
      await this.reloadKB();
    } catch {
      // First load on a fresh vault: wiki/knowledge.json may not exist yet.
    }
    this.chats = await loadChats(this.app);
    this.embeddingIndexController = this.createIndexController();

    // Status bar
    this.statusBarEl = this.addStatusBarItem();
    new StatusBarWidget(this.statusBarEl, this.progress);
    this.applyStatusBarVisibility();

    // Settings tab
    this.addSettingTab(new LlmWikiSettingsTab(this.app, this));

    // Ribbon icon — open the query modal
    this.addRibbonIcon("rainbow", "Wissensdatenbank abfragen", () => {
      this.openQueryModal();
    });

    // Commands
    this.addCommand({
      id: "run-query",
      name: "Wissensdatenbank abfragen",
      callback: () => {
        this.openQueryModal();
      },
    });

   // this.addCommand({
   //   id: "show-vocabulary",
   //   name: "Wortschatz anzeigen",
   //   callback: () => openVocabularyModal(this.app, this.kb),
   // });

    this.addCommand({
      id: "lint-kb",
      name: "Wissensdatenbank aufräumen und prüfen",
      callback: () => openLintModal(this.app, this.kb, this),
    });

    this.addCommand({
      id: "reload-kb",
      name: "Wissensdatenbank von der Festplatte neu laden",
      callback: () => {
        void this.reloadKB();
      },
    });

    this.addCommand({
      id: "extract-all",
      name: "Extrahierung starten",
      callback: () => {
        void this.runExtractAll();
      },
    });

    this.addCommand({
      id: "extract-current",
      name: "aktuelle Datei extrahieren",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== "md") return false;
        if (checking) return true;
        void this.runExtractCurrent(file);
        return true;
      },
    });

    this.addCommand({
      id: "extract-cancel",
      name: "laufende Extrahierung abbrechen",
      checkCallback: (checking) => {
        if (checking) return this.running;
        this.cancelExtraction();
        return true;
      },
    });

    this.addCommand({
      id: "regenerate-pages",
      name: "Seiten aus Wissensdatenbank neu generieren",
      callback: () => {
        void this.runRegeneratePages();
      },
    });

    // Vault event: delete — remove source from KB and regenerate pages
    this.registerEvent(
      this.app.vault.on("delete", (abstractFile) => {
        if (!(abstractFile instanceof TFile)) return;
        if (abstractFile.extension !== "md") return;
        this.kb.removeSource(abstractFile.path);
        void (async () => {
          try {
            await saveKB(this.app, this.kb, this.kbMtime);
            const r = await loadKB(this.app);
            this.kbMtime = r.mtime;
            await generatePages(this.app, this.kb);
          } catch {
            // best-effort
          }
        })();
      }),
    );

    // Vault event: rename — update source path in KB and regenerate pages
    this.registerEvent(
      this.app.vault.on("rename", (abstractFile, oldPath) => {
        if (!(abstractFile instanceof TFile)) return;
        if (abstractFile.extension !== "md") return;
        const oldSourcePage = sourcePagePath(oldPath);
        this.kb.renameSource(oldPath, abstractFile.path);
        void (async () => {
          try {
            await saveKB(this.app, this.kb, this.kbMtime);
            const r = await loadKB(this.app);
            this.kbMtime = r.mtime;
            await safeDeletePage(this.app, oldSourcePage);
            await generatePages(this.app, this.kb);
          } catch {
            // best-effort
          }
        })();
      }),
    );

    // Nightly extraction scheduler. Wait for the workspace to be ready so the
    // missed-run catch-up doesn't race the rest of plugin startup.
    this.app.workspace.onLayoutReady(() => {
      this.startScheduler();
      void this.showWelcomeIfNeeded();
    });

    // On-save watcher: re-extract a file shortly after it's saved.
    this.onSaveWatcher = new OnSaveWatcher({
      skipDirs: defaultSkipDirs(this.app.vault.configDir),
      getIncludedFolders: () => this.settings.queryFolders,
      isExtractionRunning: () => this.running,
      trigger: (path) => {
        const tfile = this.app.vault.getAbstractFileByPath(path);
        if (tfile instanceof TFile) {
          void this.runExtractCurrent(tfile);
        }
      },
    });
    this.registerEvent(
      this.app.vault.on("modify", (abstractFile) => {
        if (!(abstractFile instanceof TFile)) return;
        if (abstractFile.extension !== "md") return;
        this.onSaveWatcher?.handleModify(abstractFile.path);
      }),
    );

    this.prebuildTimer = window.setTimeout(() => {
      this.prebuildTimer = null;
      void this.embeddingIndexController?.ensureBuilt();
    }, PREBUILD_DELAY_MS);
  }

  onunload(): void {
    this.cancelExtraction();
    this.stopScheduler();
    this.onSaveWatcher?.destroy();
    this.onSaveWatcher = null;
    if (this.prebuildTimer !== null) {
      window.clearTimeout(this.prebuildTimer);
      this.prebuildTimer = null;
    }
  }

  startScheduler(): void {
    this.stopScheduler();
    if (!this.settings.nightlyExtractionEnabled) return;
    this.scheduler = new Scheduler({
      hour: this.settings.nightlyExtractionHour,
      getLastRunIso: () => this.settings.lastExtractionRunIso,
      isExtractionRunning: () => this.running,
      trigger: () => {
        void this.runExtractAll();
      },
    });
    this.scheduler.start();
  }

  stopScheduler(): void {
    if (this.scheduler) {
      this.scheduler.stop();
      this.scheduler = null;
    }
  }

  /**
   * On first load (no KB yet), show a welcome modal with a note count,
   * time estimate, and two options: extract now or defer to tonight.
   */
  private async showWelcomeIfNeeded(): Promise<void> {
    const { sources } = this.kb.stats();
    if (sources > 0) return;

    const walkOpts: WalkOptions = {
      skipDirs: defaultSkipDirs(this.app.vault.configDir),
      includeFolders: this.settings.queryFolders,
      minFileSize: DEFAULT_MIN_FILE_SIZE,
      dailiesFromIso: defaultDailiesFromIso(),
    };
    const walked = await walkVaultFiles(this.app, walkOpts);
    if (walked.length === 0) return; // empty vault, nothing to show

    new WelcomeModal(
      this.app,
      walked.length,
      this.settings.providerType === "ollama",
      {
        onStartNow: () => {
          void this.runExtractAll();
        },
        onLater: () => {
          if (!this.settings.nightlyExtractionEnabled) {
            this.settings.nightlyExtractionEnabled = true;
            void this.saveSettings();
            this.startScheduler();
          }
          new Notice(
            `LLM Wiki: Extraktion startet um ${String(this.settings.nightlyExtractionHour).padStart(2, "0")}:00.`,
          );
        },
      },
    ).open();
  }

  async loadSettings(): Promise<void> {
    const data = (await this.loadData()) as Partial<LlmWikiSettings & { defaultQueryFolder?: string }> | null;
    const { defaultQueryFolder, ...settingsData } = data ?? {};
    this.settings = { ...DEFAULT_SETTINGS, ...settingsData };
    
    // Migrate from old defaultQueryFolder to new queryFolders format
    if (defaultQueryFolder !== undefined && this.settings.queryFolders.length === 0) {
      if (defaultQueryFolder) {
        this.settings.queryFolders = [defaultQueryFolder];
      }
    }

    // Migration: older custom-provider builds stored the custom model in
    // cloudModel. Preserve that value when customOpenAIModel is empty.
    if (
      this.settings.providerType === "openai-compatible" &&
      !this.settings.customOpenAIModel &&
      this.settings.cloudModel
    ) {
      this.settings.customOpenAIModel = this.settings.cloudModel;
    }

  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  applyStatusBarVisibility(): void {
    if (this.statusBarEl) {
      this.statusBarEl.style.display = this.settings.showStatusBar ? "" : "none";
    }
  }

  async reloadKB(): Promise<void> {
    const { kb, mtime } = await loadKB(this.app);
    this.kb = kb;
    this.kbMtime = mtime;
  }

  /**
   * Called by the settings UI when the provider type, API key, or Ollama URL
   * changes. Instantiates the correct provider. For Anthropic, injects an
   * Ollama embed-provider since Anthropic has no embedding API.
   */
  rebuildProvider(): void {
    const s = this.settings;
    const ollama = new OllamaProvider({
      url: s.ollamaUrl,
      numCtx: s.ollamaNumCtx,
    });

    switch (s.providerType) {
      case "openai-compatible": {
        const key = s.customOpenAIApiKey.trim();
        const baseUrl = s.customOpenAIBaseUrl.trim();
        const modelsEndpoint = s.customOpenAIModelsEndpoint.trim() || "/v1/models";
        const completionsEndpoint =
          s.customOpenAICompletionsEndpoint.trim() || "/v1/chat/completions";
        const embeddingsEndpoint =
          s.customOpenAIEmbeddingsEndpoint.trim() || "/v1/embeddings";
        this.provider = baseUrl
          ? new OpenAIProvider({
              apiKey: key,
              baseUrl,
              modelsEndpoint,
              completionsEndpoint,
              embeddingsEndpoint,
            })
          : ollama;
        break;
      }
      case "openai": {
        const key = s.apiKeys.openai ?? "";
        this.provider = key
          ? new OpenAIProvider({ apiKey: key })
          : ollama;
        break;
      }
      case "anthropic": {
        const key = s.apiKeys.anthropic ?? "";
        this.provider = key
          ? new AnthropicProvider({ apiKey: key, embedProvider: ollama })
          : ollama;
        break;
      }
      case "google": {
        const key = s.apiKeys.google ?? "";
        this.provider = key
          ? new GoogleProvider({ apiKey: key })
          : ollama;
        break;
      }
      case "mistral": {
        const key = s.apiKeys.mistral ?? "";
        this.provider = key
          ? new MistralProvider({ apiKey: key })
          : ollama;
        break;
      }
      case "llama-cpp": {
        this.provider = new LlamaCppProvider({
          url: s.llamaCppUrl,
          numCtx: s.llamaCppNumCtx,
        });
        break;
      }
      default:
        this.provider = ollama;
    }
  }

  /** The model to use for completion — cloud model if a cloud provider is active, otherwise Ollama. */
  get activeModel(): string {
    if (
      this.settings.providerType === "openai-compatible" &&
      !this.hasCustomOpenAIBaseUrl()
    ) {
      return this.settings.ollamaModel;
    }
    if (
      this.settings.providerType === "openai-compatible" &&
      this.settings.customOpenAIModel
    ) {
      return this.settings.customOpenAIModel;
    }
    if (this.settings.providerType === "llama-cpp") {
      return this.settings.llamaCppModel;
    }
    if (this.settings.providerType !== "ollama") {
      const provider = this.settings.providerType as CloudProvider;
      const configured = this.settings.cloudModel;
      const valid = completionModels(provider).some((m) => m.id === configured);
      if (configured && valid) {
        return configured;
      }
      return defaultCompletionModel(provider);
    }
    return this.settings.ollamaModel;
  }

  get activeEmbeddingModel(): string {
    if (this.settings.providerType === "openai-compatible") {
      if (!this.hasCustomOpenAIBaseUrl()) {
        return this.settings.ollamaEmbeddingModel || EMBEDDING_MODEL;
      }
      return (
        this.settings.customOpenAIEmbeddingModel ||
        this.settings.customOpenAIModel ||
        EMBEDDING_MODEL
      );
    }
    if (this.settings.providerType === "llama-cpp") {
      return this.settings.llamaCppEmbeddingModel || EMBEDDING_MODEL;
    }
    if (this.settings.providerType !== "ollama") {
      const provider = this.settings.providerType;
      return defaultEmbeddingModel(provider) ?? EMBEDDING_MODEL;
    }
    return this.settings.ollamaEmbeddingModel || EMBEDDING_MODEL;
  }

  get extractionOutputLanguage(): string {
    return describeExtractionLanguage(
      this.settings.extractionOutputLanguage,
      getLanguage(),
    );
  }

  private hasCustomOpenAIBaseUrl(): boolean {
    return (this.settings.customOpenAIBaseUrl ?? "").trim().length > 0;
  }

  isExtractionRunning(): boolean {
    return this.running;
  }

  cancelExtraction(): void {
    if (this.abortController) this.abortController.abort();
  }

  private createIndexController(): EmbeddingIndexController {
    return new EmbeddingIndexController({
      buildIndex: async (onProgress) => {
        if (!this.embeddingsCache) {
          this.embeddingsCache = await loadEmbeddingsCache(this.app);
        }
        const index = await buildEmbeddingIndex({
          kb: this.kb,
          provider: this.provider,
          model: this.activeEmbeddingModel,
          cache: this.embeddingsCache,
          onProgress,
        });
        await saveEmbeddingsCache(this.app, this.embeddingsCache);
        return index;
      },
    });
  }

  async runExtractAll(): Promise<void> {
    if (this.running) {
      new Notice("Extrahierung läuft bereits.");
      return;
    }
    // Preflight: provider reachable + model available.
    const reachable = await this.provider.ping();
    if (!reachable) {
      const target =
        this.settings.providerType === "ollama"
          ? `Ollama at ${this.settings.ollamaUrl}`
          : `${this.settings.providerType} API`;
      new Notice(`LLM Wiki: ${target} nicht erreichbar. Überprüfe die Verbindung und versuchen es erneut.`);
      return;
    }
    if (this.provider.listModels) {
      const models = await this.provider.listModels();
      if (models && !models.includes(this.activeModel)) {
        const hint =
          this.settings.providerType === "ollama"
            ? ` Run \`ollama pull ${this.activeModel}\`.`
            : " Choose a different model in settings.";
        new Notice(
          `LLM Wiki: Model "${this.activeModel}" nicht verfügbar.${hint}`,
        );
        return;
      }
    }

    this.setRunning(true);
    this.abortController = new AbortController();

    try {
      await this.reloadKB();
      const walkOpts: WalkOptions = {
        skipDirs: defaultSkipDirs(this.app.vault.configDir),
        includeFolders: this.settings.queryFolders,
        minFileSize: DEFAULT_MIN_FILE_SIZE,
        dailiesFromIso: defaultDailiesFromIso(),
      };
      const walked = await walkVaultFiles(this.app, walkOpts);
      if (walked.length === 0) {
        new Notice(
          "Es gibt nichts zu extrahieren (alle Dateien wurden nach Ordnern, auszuschließenden Verzeichnissen, Mindestgröße oder Tagesgrenzen gefiltert).",
        );
        return;
      }
      const files: QueueFile[] = [];
      for (const w of walked) {
        const tfile = this.app.vault.getAbstractFileByPath(w.path);
        if (!(tfile instanceof TFile)) continue;
        // Fast pre-check: if stored record has contentHash and mtime hasn't changed,
        // we can skip reading file content and computing SHA-256 entirely.
        if (!this.kb.needsExtractionFast(w.path, w.mtime)) {
          // Still register hash backfill / skip in the queue with an empty content stub
          files.push({
            path: w.path,
            content: "",
            mtime: w.mtime,
            contentHash: this.kb.data.sources[w.path]?.contentHash ?? "",
            origin: w.origin,
          });
          continue;
        }
        const content = await this.app.vault.cachedRead(tfile);
        const contentHash = await sha256Hex(content);
        files.push({
          path: w.path,
          content,
          mtime: w.mtime,
          contentHash,
          origin: w.origin,
        });
      }

      const saveCallback = async (): Promise<void> => {
        await saveKB(this.app, this.kb, this.kbMtime);
        const reloaded = await loadKB(this.app);
        this.kbMtime = reloaded.mtime;
      };

      const stats = await runExtraction({
        provider: this.provider,
        kb: this.kb,
        files,
        model: this.activeModel,
        outputLanguage: this.extractionOutputLanguage,
        saveKB: saveCallback,
        emitter: this.progress,
        checkpointEvery: 5,
        charLimit: this.settings.extractionCharLimit,
        signal: this.abortController.signal,
        concurrency: this.settings.extractionConcurrency ?? 3,
      });

      this.settings.lastExtractionRunIso = new Date().toISOString();
      await this.saveSettings();
      await appendWikiLog(this.app, `Ingest | Batch-Extraktion durchgeführt: ${stats.succeeded} erfolgreich, ${stats.failed} fehlgeschlagen, ${stats.skipped} übersprungen`);
      new Notice(
        `LLM Wiki: ${stats.succeeded} extracted, ${stats.failed} failed, ${stats.skipped} skipped (${Math.round(stats.elapsedMs / 1000)}s).`,
      );
      await generatePages(this.app, this.kb);
    } catch (e) {
      this.progress.emit("batch-errored", {
        message: (e as Error).message ?? "Unknown error",
      });
      new Notice(`LLM Wiki: Extraktion fehlgeschlagen — ${(e as Error).message}`);
    } finally {
      this.setRunning(false);
      this.abortController = null;
    }
  }

  private openQueryModal(): void {
    if (!this.kb) {
      new Notice("Knowledge base noch nicht geladen.");
      return;
    }
    if (!this.embeddingIndexController) {
      this.embeddingIndexController = this.createIndexController();
    }

    const modal = new QueryModal({
      app: this.app,
      kb: this.kb,
      provider: this.provider,
      providerLabel: this.settings.providerType,
      embedFallbackProvider:
        this.settings.providerType === "anthropic"
          ? new OllamaProvider({ url: this.settings.ollamaUrl })
          : undefined,
      model: this.activeModel,
      embeddingModel: this.activeEmbeddingModel,
      folders: this.settings.queryFolders,
      chats: this.chats,
      activeChatId: null,
      indexController: this.embeddingIndexController,
      onChatsChanged: (chats): void => {
        this.chats = [...chats];
        void saveChats(this.app, this.chats);
      },
      onModelChanged: (model): void => {
        if (this.settings.providerType === "ollama") {
          this.settings.ollamaModel = model;
        } else if (this.settings.providerType === "llama-cpp") {
          this.settings.llamaCppModel = model;
        } else if (this.settings.providerType === "openai-compatible") {
          this.settings.customOpenAIModel = model;
        } else {
          this.settings.cloudModel = model;
        }
        void this.saveSettings();
      },
      onAnswered: ({ question, answer, bundle, elapsedMs }): void => {
        void appendInteractionLog(this.app, {
          question,
          answer,
          model: this.activeModel,
          queryType: bundle.queryType,
          entityCount: bundle.entities.length,
          conceptCount: bundle.concepts.length,
          elapsedMs,
        });
        void appendWikiLog(this.app, `Anfrage | Frage: "${question}" (${bundle.entities.length} Entitäten, ${bundle.concepts.length} Konzepte geliefert, ${Math.round(elapsedMs / 100) / 10}s)`);
      },
    });
    modal.open();
  }

  async runRegeneratePages(): Promise<void> {
    try {
      const result = await generatePages(this.app, this.kb);
      new Notice(
        `LLM Wiki: ${result.written} Seiten geschrieben, ${result.deleted} gelöscht.`,
      );
    } catch (e) {
      new Notice(`LLM Wiki: Seiten-Generierung fehlgeschlagen — ${(e as Error).message}`);
    }
  }

  /**
   * Adds or removes "wiki/" from Obsidian's excluded-files filter based on
   * the hideWikiFromSearch setting. When hidden, generated pages won't
   * appear in search, Quick Switcher, or graph view.
   */
  applySearchExclusion(): void {
    const FILTER = "wiki/";
    // getConfig/setConfig are undocumented but stable Vault internals
    // used by many community plugins to read/write app.json settings.
    const vault = this.app.vault as unknown as {
      getConfig(key: string): unknown;
      setConfig(key: string, value: unknown): void;
    };
    if (typeof vault.getConfig !== "function") return;

    const raw = vault.getConfig("userIgnoreFilters");
    const filters: string[] = Array.isArray(raw) ? (raw as string[]) : [];
    const present = filters.includes(FILTER);

    if (this.settings.hideWikiFromSearch && !present) {
      vault.setConfig("userIgnoreFilters", [...filters, FILTER]);
    } else if (!this.settings.hideWikiFromSearch && present) {
      vault.setConfig("userIgnoreFilters", filters.filter((f) => f !== FILTER));
    }
  }

  async runExtractCurrent(file: TFile): Promise<void> {
    if (this.running) {
      new Notice("Warte auf Abschluss der aktuellen Extraktion.");
      return;
    }
    this.setRunning(true);
    this.abortController = new AbortController();
    try {
      await this.reloadKB();
      const content = await this.app.vault.cachedRead(file);
      const contentHash = await sha256Hex(content);
      await extractFile({
        provider: this.provider,
        kb: this.kb,
        file: {
          path: file.path,
          content,
          mtime: file.stat.mtime,
          contentHash,
          origin: "user-note",
        },
        model: this.activeModel,
        outputLanguage: this.extractionOutputLanguage,
        signal: this.abortController.signal,
        charLimit: this.settings.extractionCharLimit,
      });
      await saveKB(this.app, this.kb, this.kbMtime);
      const reloaded = await loadKB(this.app);
      this.kbMtime = reloaded.mtime;
      await appendWikiLog(this.app, `Ingest | Datei extrahiert: [[wiki/sources/${file.path}|${file.path}]]`);
      await generatePages(this.app, this.kb);

      // Re-index the embedding cache so on-save extractions are immediately
      // searchable via semantic retrieval.
      this.embeddingsCache = await loadEmbeddingsCache(this.app);
      await this.embeddingIndexController?.ensureBuilt();
    } catch (e) {
      new Notice(`LLM Wiki: extrahieren fehlgeschlagen — ${(e as Error).message}`);
    } finally {
      this.setRunning(false);
      this.abortController = null;
    }
  }
}

const EXTRACTION_LANGUAGE_LABELS: Record<
  Exclude<ExtractionLanguageSetting, "app">,
  string
> = {
  en: "English",
  fr: "French",
  es: "Spanish",
  de: "German",
  it: "Italian",
  nl: "Dutch",
  pt: "Portuguese",
};

export function describeExtractionLanguage(
  setting: string,
  appLanguage: string,
): string {
  if (setting !== "app") {
    return (
      EXTRACTION_LANGUAGE_LABELS[
        setting as Exclude<ExtractionLanguageSetting, "app">
      ] ?? resolveLanguageLabel(setting)
    );
  }
  return resolveLanguageLabel(appLanguage);
}

function resolveLanguageLabel(language: string): string {
  const trimmed = language.trim();
  const normalized = trimmed.toLowerCase();
  const base = normalized.split("-")[0] as Exclude<
    ExtractionLanguageSetting,
    "app"
  >;
  const knownLanguage = EXTRACTION_LANGUAGE_LABELS[base];
  if (knownLanguage) {
    return knownLanguage;
  }

  try {
    const displayNames = new Intl.DisplayNames(["de"], { type: "language" });
    return (
      displayNames.of(normalized) ??
      displayNames.of(base) ??
      (normalized || trimmed || "German")
    );
  } catch {
    return normalized || trimmed || "German";
  }
}

