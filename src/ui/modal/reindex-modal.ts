import { App, Modal, Setting } from "obsidian";
import type LlmWikiPlugin from "../../plugin.js";

export class ReindexConfirmationModal extends Modal {
  constructor(
    app: App,
    private readonly plugin: LlmWikiPlugin,
    private readonly newModel: string,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("llm-wiki-reindex-modal");

    contentEl.createEl("h2", { text: "Embedding-Modell geändert" });

    const descEl = contentEl.createEl("p");
    descEl.setText(
      `Du hast das Embedding-Modell zu "${this.newModel}" geändert. ` +
      "Damit die semantische Suche korrekt funktioniert, müssen alle Notizen mit dem neuen Modell neu indiziert werden. " +
      "Möchtest du den Embedding-Index jetzt neu aufbauen?"
    );

    new Setting(contentEl)
      .addButton((btn) =>
        btn
          .setButtonText("Später")
          .onClick(() => {
            this.close();
          })
      )
      .addButton((btn) =>
        btn
          .setButtonText("Jetzt neu aufbauen")
          .setCta()
          .onClick(() => {
            this.close();
            void this.plugin.rebuildEmbeddings();
          })
      );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
