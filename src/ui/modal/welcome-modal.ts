import { App, Modal } from "obsidian";

export interface WelcomeModalCallbacks {
  onStartNow: () => void;
  onLater: () => void;
}

/**
 * Shown once on first load when no knowledge base exists yet.
 * Gives the user a note count, a time estimate, and two choices:
 * start extraction now or defer to the nightly scheduler.
 */
export class WelcomeModal extends Modal {
  constructor(
    app: App,
    private readonly noteCount: number,
    private readonly isLocal: boolean,
    private readonly callbacks: WelcomeModalCallbacks,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("llm-wiki-welcome-modal");

    contentEl.createEl("h2", { text: "Willkommen" });

    const introEl = contentEl.createEl("p");
    introEl.appendText("Dein Vault muss erst indiziert werden, bevor du Fragen stellen kannst.");
    introEl.createEl("br");
    introEl.appendText(
      "Die Extraktion liest jede Notiz und baut eine strukturierte Wissensdatenbank auf — " +
      "dies muss nur einmal durchgeführt werden.",
    );

    const estimate = this.formatEstimate();
    const estimateEl = contentEl.createEl("p");
    estimateEl.createEl("strong", { text: `${this.noteCount} Notizen gefunden` });
    estimateEl.appendText(` — geschätzte Verarbeitungsdauer: ${estimate}.`);

    if (this.isLocal) {
      contentEl.createEl("p", {
        text:
          "Diese Schätzung gilt für lokale Sprachmodelle. Cloud-Anbieter (OpenAI, Anthropic, Google) " +
          "sind deutlich schneller — du kannst diese bei Bedarf in den Einstellungen > LLM Wiki konfigurieren.",
        cls: "mod-muted",
      });
    }

    const btnContainer = contentEl.createDiv({ cls: "modal-button-container" });

    const laterBtn = btnContainer.createEl("button", { text: "Später" });
    laterBtn.addEventListener("click", () => {
      this.close();
      this.callbacks.onLater();
    });

    const startBtn = btnContainer.createEl("button", {
      text: "Jetzt starten",
      cls: "mod-cta",
    });
    startBtn.addEventListener("click", () => {
      this.close();
      this.callbacks.onStartNow();
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }

  /**
   * Estimation based on provider type and note count.
   */
  private formatEstimate(): string {
    const secsPerNote = this.isLocal ? 24 : 2;
    const totalMins = Math.ceil((this.noteCount * secsPerNote) / 60);

    if (totalMins < 2) return "unter 2 Minuten";
    if (totalMins < 60) return `ca. ${totalMins} Minuten`;

    const hours = totalMins / 60;
    if (hours < 1.5) return "ca. 1 Stunde";
    return `ca. ${Math.round(hours)} Stunden`;
  }
}
