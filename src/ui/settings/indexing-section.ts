import { Setting } from "obsidian";
import type LlmWikiPlugin from "../../plugin.js";
import type { ExtractionLanguageSetting } from "../../plugin.js";

export interface IndexingSectionHandlers {
  onIndexAll: () => void;
  onIndexCancel: () => void;
  isRunning: () => boolean;
  rerender: () => void;
}

export function renderIndexingSection(
  containerEl: HTMLElement,
  plugin: LlmWikiPlugin,
  handlers: IndexingSectionHandlers,
): void {
  new Setting(containerEl).setName("Indizierung").setHeading();

  // ── Ollama URL (only visible when Ollama is the active provider) ──
  if (plugin.settings.providerType === "ollama") {
    new Setting(containerEl)
      .setName("Ollama-URL")
      .setDesc("Basis-URL deines lokalen Servers.")
      .addText((text) =>
        text
          .setPlaceholder("Server-URL")
          .setValue(plugin.settings.ollamaUrl)
          .onChange(async (value) => {
            plugin.settings.ollamaUrl =
              value.trim() || "http://localhost:11434";
            await plugin.saveSettings();
            plugin.rebuildProvider();
          }),
      );
  }

  // ── Index now / cancel ────────────────────────────────────────────
  const running = handlers.isRunning();
  const lastRunText = plugin.settings.lastExtractionRunIso
    ? new Date(plugin.settings.lastExtractionRunIso).toLocaleString("de-DE")
    : "nie";

  const indexSetting = new Setting(containerEl)
    .setName("Jetzt indizieren")
    .setDesc("Durchsucht den Vault und extrahiert neue oder geänderte Dateien.");

  indexSetting.descEl.createEl("div", {
    text: running ? "Extraktion läuft\u2026" : `Zuletzt ausgeführt: ${lastRunText}`,
    cls: "llm-wiki-indexing-status",
  });

  if (running) {
    indexSetting.addButton((btn) =>
      btn
        .setButtonText("Abbrechen")
        .setWarning()
        .onClick(() => {
          handlers.onIndexCancel();
        }),
    );
  } else {
    indexSetting.addButton((btn) =>
      btn
        .setButtonText("Extraktion starten")
        .setCta()
        .onClick(() => {
          handlers.onIndexAll();
        }),
    );
  }

  new Setting(containerEl)
    .setName("Extraktionssprache")
    .setDesc(
      `Sprache für Zusammenfassungen, Fakten und Definitionen. Aktuelle Ausgabe: ${plugin.extractionOutputLanguage}.`,
    )
    .addDropdown((dropdown) => {
      for (const [value, label] of EXTRACTION_LANGUAGE_OPTIONS) {
        dropdown.addOption(value, label);
      }
      dropdown.setValue(plugin.settings.extractionOutputLanguage);
      dropdown.onChange(async (value) => {
        plugin.settings.extractionOutputLanguage =
          value as ExtractionLanguageSetting;
        await plugin.saveSettings();
        handlers.rerender();
      });
    });

  // ── Daily refresh ─────────────────────────────────────────────────
  new Setting(containerEl)
    .setName("Tägliche Aktualisierung")
    .setDesc(
      "Verarbeitet einmal täglich Änderungen und neue Notizen im Vault im Hintergrund.",
    )
    .addToggle((toggle) =>
      toggle
        .setValue(plugin.settings.nightlyExtractionEnabled)
        .onChange(async (value) => {
          plugin.settings.nightlyExtractionEnabled = value;
          await plugin.saveSettings();
          plugin.startScheduler();
          handlers.rerender();
        }),
    );

  if (plugin.settings.nightlyExtractionEnabled) {
    new Setting(containerEl)
      .setName("Uhrzeit der Aktualisierung")
      .setDesc("Stunde (0\u201323, Lokalzeit), zu der die tägliche Aktualisierung startet.")
      .addText((text) =>
        text
          .setPlaceholder("2")
          .setValue(String(plugin.settings.nightlyExtractionHour))
          .onChange(async (value) => {
            const parsed = Number.parseInt(value, 10);
            if (!Number.isFinite(parsed) || parsed < 0 || parsed > 23) return;
            plugin.settings.nightlyExtractionHour = parsed;
            await plugin.saveSettings();
            plugin.startScheduler();
          }),
      );
  }
}

const EXTRACTION_LANGUAGE_OPTIONS: ReadonlyArray<
  [ExtractionLanguageSetting, string]
> = [
  ["app", "Auto (Obsidian-Sprache verwenden)"],
  ["en", "Englisch"],
  ["fr", "Französisch"],
  ["es", "Spanisch"],
  ["de", "Deutsch"],
  ["it", "Italienisch"],
  ["nl", "Niederländisch"],
  ["pt", "Portugiesisch"],
];
