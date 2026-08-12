/**
 * Settings UI section for cloud provider configuration: provider picker,
 * API key entry with auto-validation.
 */

import { completionModels, defaultCompletionModel } from "../../llm/catalog.js";
import { detectProvider, validateKey } from "../../llm/detect-key.js";

import type { CloudProvider } from "../../llm/catalog.js";
import type LlmWikiPlugin from "../../plugin.js";
import type { ProviderType } from "../../plugin.js";
import { ReindexConfirmationModal } from "../modal/reindex-modal.js";
import { Setting } from "obsidian";

export interface CloudSectionHandlers {
  rerender: () => void;
}

const PROVIDER_LABELS: Record<ProviderType, string> = {
  ollama: "Ollama (local)",
  "llama-cpp": "Llama.cpp (local)",
  "openai-compatible": "OpenAI-compatible (custom)",
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google Gemini",
  mistral: "Mistral",
};

const PROVIDER_OPTIONS: ProviderType[] = [
  "ollama",
  "llama-cpp",
  "openai-compatible",
  "openai",
  "anthropic",
  "google",
  "mistral",
];

export function renderCloudSection(
  containerEl: HTMLElement,
  plugin: LlmWikiPlugin,
  handlers: CloudSectionHandlers,
): void {
  new Setting(containerEl).setName("Modell").setHeading();

  // ── Provider picker ───────────────────────────────────────────────
  new Setting(containerEl)
    .setName("Anbieter")
    .setDesc("Wähle zwischen einem lokalen Server oder einer Cloud-API.")
    .addDropdown((dropdown) => {
      for (const p of PROVIDER_OPTIONS) {
        dropdown.addOption(p, PROVIDER_LABELS[p]);
      }
      dropdown.setValue(plugin.settings.providerType);
      dropdown.onChange(async (value) => {
        plugin.settings.providerType = value as ProviderType;
        if (value === "openai-compatible") {
          if (!plugin.settings.customOpenAIModel) {
            plugin.settings.customOpenAIModel = "gpt-4o-mini";
          }
        } else if (value !== "ollama" && value !== "llama-cpp" && !plugin.settings.cloudModel) {
          plugin.settings.cloudModel = defaultCompletionModel(
            value as CloudProvider,
          );
        } else if (value !== "ollama" && value !== "llama-cpp") {
          const provider = value as CloudProvider;
          const valid = completionModels(provider).some(
            (m) => m.id === plugin.settings.cloudModel,
          );
          if (!valid) {
            plugin.settings.cloudModel = defaultCompletionModel(provider);
          }
        }
        await plugin.saveSettings();
        plugin.rebuildProvider();
        handlers.rerender();
      });
    });

  // ── API key entry (only for cloud providers) ──────────────────────
  const pt = plugin.settings.providerType;
  if (pt === "ollama" || pt === "llama-cpp") return;

  if (pt === "openai-compatible") {
    new Setting(containerEl)
      .setName("Basis-URL")
      .setDesc("Endpunkt-Root für deine OpenAI-kompatible API (z. B. https://api.groq.com).")
      .addText((text) =>
        text
          .setPlaceholder("Basis-URL einfügen")
          .setValue(plugin.settings.customOpenAIBaseUrl)
          .onChange(async (value) => {
            plugin.settings.customOpenAIBaseUrl = value.trim();
            await plugin.saveSettings();
            plugin.rebuildProvider();
          }),
      );

    new Setting(containerEl)
      .setName("API-Schlüssel")
      .setDesc("Optional für selbst gehostete Anbieter. Wird lokal in der Datei data.json dieses Vaults gespeichert.")
      .addText((text) =>
        text
          .setPlaceholder("API-Schlüssel einfügen\u2026")
          .setValue(
            plugin.settings.customOpenAIApiKey
              ? maskKey(plugin.settings.customOpenAIApiKey)
              : "",
          )
          .onChange(async (value) => {
            const trimmed = value.trim();
            const masked = maskKey(plugin.settings.customOpenAIApiKey);
            if (trimmed === masked) return;
            plugin.settings.customOpenAIApiKey = trimmed;
            await plugin.saveSettings();
            plugin.rebuildProvider();
            handlers.rerender();
          }),
      );

    new Setting(containerEl)
      .setName("Modell")
      .setDesc("Completion-Modell für Extraktion und Chat.")
      .addText((text) =>
        text
          .setPlaceholder("Name des Completion-Modells")
          .setValue(plugin.settings.customOpenAIModel)
          .onChange(async (value) => {
            plugin.settings.customOpenAIModel = value.trim();
            await plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Embedding-Modell")
      .setDesc("Optional. Standardmäßig wird das Completion-Modell verwendet, wenn leer gelassen.")
      .addText((text) => {
        let prevValue = plugin.settings.customOpenAIEmbeddingModel;
        text
          .setPlaceholder("Name des Embedding-Modells")
          .setValue(plugin.settings.customOpenAIEmbeddingModel)
          .onChange(async (value) => {
            plugin.settings.customOpenAIEmbeddingModel = value.trim();
            await plugin.saveSettings();
          });

        text.inputEl.addEventListener("blur", () => {
          const currentValue = plugin.settings.customOpenAIEmbeddingModel;
          if (currentValue !== prevValue) {
            prevValue = currentValue;
            new ReindexConfirmationModal(plugin.app, plugin, currentValue).open();
          }
        });
      });

    new Setting(containerEl)
      .setName("Modell-Endpunkt")
      .setDesc("Pfad oder absolute URL zur Modellliste. Standard: /v1/models")
      .addText((text) =>
        text
          .setPlaceholder("/v1/models")
          .setValue(plugin.settings.customOpenAIModelsEndpoint)
          .onChange(async (value) => {
            plugin.settings.customOpenAIModelsEndpoint = value.trim() || "/v1/models";
            await plugin.saveSettings();
            plugin.rebuildProvider();
          }),
      );

    new Setting(containerEl)
      .setName("Completion-Endpunkt")
      .setDesc("Pfad oder absolute URL zur Texterzeugung. Chat-Completions und Legacy-Completions werden beide unterstützt.")
      .addText((text) =>
        text
          .setPlaceholder("/v1/chat/completions")
          .setValue(plugin.settings.customOpenAICompletionsEndpoint)
          .onChange(async (value) => {
            plugin.settings.customOpenAICompletionsEndpoint =
              value.trim() || "/v1/chat/completions";
            await plugin.saveSettings();
            plugin.rebuildProvider();
          }),
      );

    new Setting(containerEl)
      .setName("Embedding-Endpunkt")
      .setDesc("Pfad oder absolute URL für Embeddings. Standard: /v1/embeddings")
      .addText((text) =>
        text
          .setPlaceholder("/v1/embeddings")
          .setValue(plugin.settings.customOpenAIEmbeddingsEndpoint)
          .onChange(async (value) => {
            plugin.settings.customOpenAIEmbeddingsEndpoint =
              value.trim() || "/v1/embeddings";
            await plugin.saveSettings();
            plugin.rebuildProvider();
          }),
      );

    return;
  }

  const providerKey = pt;
  const currentKey = plugin.settings.apiKeys[providerKey] ?? "";
  const cached = plugin.keyValidationCache[providerKey];
  const masked = currentKey ? maskKey(currentKey) : "";

  const keySetting = new Setting(containerEl).setName(
    `${PROVIDER_LABELS[pt]}-API-Schlüssel`,
  );

  // Description: "Aktuell: sk-p\u2022\u2022\u2022\u2022-XgA" colored by validation state
  if (currentKey) {
    const descEl = keySetting.descEl;
    const statusCls = cached
      ? cached.valid
        ? "llm-wiki-key-valid"
        : "llm-wiki-key-invalid"
      : "llm-wiki-key-validating";

    descEl.createSpan({
      text: `Aktuell: ${masked}`,
      cls: statusCls,
    });

    // Mismatch warning
    const detected = detectProvider(currentKey);
    if (detected !== null && detected !== providerKey) {
      descEl.createEl("br");
      descEl.createSpan({
        text: `Dies sieht nach einem Schlüssel für ${PROVIDER_LABELS[detected]} aus.`,
        cls: "llm-wiki-key-invalid",
      });
    }

    // Kick off validation if not yet cached
    if (!cached) {
      void validateKey(providerKey, currentKey).then((err) => {
        plugin.keyValidationCache[providerKey] = {
          valid: err === null,
          error: err,
        };
        handlers.rerender();
      });
    }
  } else {
    keySetting.setDesc("Kein API-Schlüssel gesetzt.");
  }

  // Text field: shows the masked key so it doesn't feel like it vanished
  keySetting.addText((text) =>
    text
      .setPlaceholder("API-Schlüssel einfügen\u2026")
      .setValue(masked)
      .onChange(async (value) => {
        const trimmed = value.trim();
        if (trimmed === masked) return;
        plugin.settings.apiKeys[providerKey] = trimmed;
        delete plugin.keyValidationCache[providerKey];
        await plugin.saveSettings();
        plugin.rebuildProvider();
        handlers.rerender();
      }),
  );

  // ── Privacy & security notes ──────────────────────────────────────
  const privacyEl = containerEl.createEl("p", {
    cls: "setting-item-description llm-wiki-privacy-note",
  });
  privacyEl.setText(
    "Bei Verwendung eines Cloud-Anbieters werden Notizinhalte während der Extraktion und bei Abfragen an dessen Server gesendet. " +
      "Verwende Ollama, wenn deine Notizen auf deinem Rechner bleiben sollen.",
  );

  const keyNoteEl = containerEl.createEl("p", {
    cls: "setting-item-description llm-wiki-security-note",
  });
  keyNoteEl.setText(
    "API-Schlüssel werden in der Datei data.json dieses Vaults gespeichert \u2014 lokal auf deinem Rechner, nicht durch Obsidian Sync synchronisiert.",
  );
}

function maskKey(key: string): string {
  if (key.length <= 8) return "••••";
  return key.slice(0, 4) + "••••" + key.slice(-4);
}
