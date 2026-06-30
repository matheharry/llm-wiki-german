import { App, Modal, Notice } from "obsidian";
import { KnowledgeBase } from "../../core/kb.js";
import { runLint, type LintResult } from "../../core/lint.js";
import { safeWritePage } from "../../vault/safe-write.js";
import { appendWikiLog } from "../../vault/wiki-log.js";

export function openLintModal(app: App, kb: KnowledgeBase): void {
  new LintModal(app, kb).open();
}

class LintModal extends Modal {
  private result: LintResult;

  constructor(
    app: App,
    private readonly kb: KnowledgeBase,
  ) {
    super(app);
    this.result = runLint(this.kb);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("llm-wiki-lint-modal");

    contentEl.createEl("h2", { text: "Wissensdatenbank Integritätsprüfung" });

    // Render Stats
    const statsContainer = contentEl.createDiv({ cls: "llm-wiki-lint-stats" });
    statsContainer.style.display = "grid";
    statsContainer.style.gridTemplateColumns = "repeat(auto-fit, minmax(120px, 1fr))";
    statsContainer.style.gap = "10px";
    statsContainer.style.marginBottom = "20px";

    const addStat = (label: string, value: string | number) => {
      const card = statsContainer.createDiv();
      card.style.border = "1px solid var(--background-modifier-border)";
      card.style.borderRadius = "4px";
      card.style.padding = "10px";
      card.style.textAlign = "center";
      card.style.backgroundColor = "var(--background-secondary)";
      card.createEl("div", { text: String(value), title: label }).style.fontSize = "1.5em";
      const lblEl = card.createEl("div", { text: label });
      lblEl.style.fontSize = "0.8em";
      lblEl.style.color = "var(--text-muted)";
    };

    const s = this.result.stats;
    addStat("Entitäten (Qualität)", `${s.totalEntities} (${s.qualityEntities})`);
    addStat("Konzepte (Qualität)", `${s.totalConcepts} (${s.qualityConcepts})`);
    addStat("Verbindungen", s.totalConnections);
    addStat("Quellen", s.totalSources);

    // Filter controls or quick summary
    const summaryEl = contentEl.createEl("p");
    const errors = this.result.issues.filter((i) => i.severity === "error").length;
    const warnings = this.result.issues.filter((i) => i.severity === "warning").length;
    const infos = this.result.issues.filter((i) => i.severity === "info").length;

    summaryEl.innerHTML = `Gefunden: <b>${errors}</b> Fehler, <b>${warnings}</b> Warnungen, <b>${infos}</b> Hinweise.`;

    // Action buttons
    const btnContainer = contentEl.createDiv();
    btnContainer.style.marginBottom = "15px";
    btnContainer.style.display = "flex";
    btnContainer.style.gap = "10px";

    const exportBtn = btnContainer.createEl("button", {
      text: "Report in wiki/lint-report.md speichern",
      cls: "mod-cta",
    });
    exportBtn.addEventListener("click", async () => {
      try {
        await this.exportReport();
        new Notice("Lint-Report erfolgreich in wiki/lint-report.md gespeichert.");
      } catch (err) {
        new Notice(`Fehler beim Speichern des Reports: ${(err as Error).message}`);
      }
    });

    const closeBtn = btnContainer.createEl("button", { text: "Schließen" });
    closeBtn.addEventListener("click", () => this.close());

    // Issues list
    const listContainer = contentEl.createDiv({ cls: "llm-wiki-lint-issues" });
    listContainer.style.maxHeight = "350px";
    listContainer.style.overflowY = "auto";
    listContainer.style.border = "1px solid var(--background-modifier-border)";
    listContainer.style.borderRadius = "4px";
    listContainer.style.padding = "10px";

    if (this.result.issues.length === 0) {
      listContainer.createEl("p", { text: "Keine Integritätsprobleme gefunden! Die Datenbank ist gesund." });
    } else {
      // Sort issues by severity: error first, then warning, then info
      const severityWeight = { error: 3, warning: 2, info: 1 };
      const sortedIssues = [...this.result.issues].sort(
        (a, b) => severityWeight[b.severity] - severityWeight[a.severity],
      );

      for (const issue of sortedIssues) {
        const item = listContainer.createDiv();
        item.style.marginBottom = "10px";
        item.style.paddingBottom = "10px";
        item.style.borderBottom = "1px dashed var(--background-modifier-border)";

        const header = item.createDiv();
        header.style.display = "flex";
        header.style.justifyContent = "space-between";
        header.style.fontWeight = "bold";

        const badge = header.createSpan({ text: issue.severity.toUpperCase() });
        badge.style.padding = "2px 6px";
        badge.style.borderRadius = "3px";
        badge.style.fontSize = "0.75em";

        if (issue.severity === "error") {
          badge.style.backgroundColor = "var(--text-error)";
          badge.style.color = "#fff";
        } else if (issue.severity === "warning") {
          badge.style.backgroundColor = "var(--text-accent)";
          badge.style.color = "#fff";
        } else {
          badge.style.backgroundColor = "var(--background-modifier-border)";
          badge.style.color = "var(--text-normal)";
        }

        const title = header.createSpan({ text: `[${issue.category}] ${issue.message}` });
        title.style.flex = "1";
        title.style.marginLeft = "10px";

        const detail = item.createDiv({ text: issue.detail });
        detail.style.fontSize = "0.9em";
        detail.style.color = "var(--text-muted)";
        detail.style.marginTop = "4px";
      }
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private async exportReport(): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
    const fm = {
      typ: "bericht",
      tags: ["llm-wiki/lint-report"],
      aktualisiert: today,
    };

    const serializeFm = (fmObj: Record<string, unknown>) => {
      const lines = ["---"];
      for (const [k, v] of Object.entries(fmObj)) {
        lines.push(`${k}: ${v}`);
      }
      lines.push("---");
      return lines.join("\n") + "\n";
    };

    const lines = [
      serializeFm(fm),
      "",
      "# Wissensdatenbank Lint-Bericht",
      "",
      `Generiert am: **${today}**`,
      "",
      "## Zusammenfassung",
      "",
      `- **Fehler**: ${this.result.issues.filter((i) => i.severity === "error").length}`,
      `- **Warnungen**: ${this.result.issues.filter((i) => i.severity === "warning").length}`,
      `- **Hinweise**: ${this.result.issues.filter((i) => i.severity === "info").length}`,
      "",
      "## Statistiken",
      "",
      `- **Entitäten gesamt**: ${this.result.stats.totalEntities} (${this.result.stats.qualityEntities} mit ausreichender Qualität)`,
      `- **Konzepte gesamt**: ${this.result.stats.totalConcepts} (${this.result.stats.qualityConcepts} mit ausreichender Qualität)`,
      `- **Verbindungen**: ${this.result.stats.totalConnections}`,
      `- **Quellen**: ${this.result.stats.totalSources}`,
      "",
      "## Gefundene Probleme",
      "",
    ];

    if (this.result.issues.length === 0) {
      lines.push("Keine Probleme gefunden! Die Datenbank ist in perfektem Zustand.");
    } else {
      const severityIcons = { error: "🔴 Fehler", warning: "🟡 Warnung", info: "ℹ️ Hinweis" };
      for (const issue of this.result.issues) {
        lines.push(`### ${severityIcons[issue.severity]} | [${issue.category}] ${issue.message}`);
        lines.push(`${issue.detail}`);
        lines.push("");
      }
    }

    const reportContent = lines.join("\n");
    await safeWritePage(this.app, "wiki/lint-report.md", reportContent);
    await appendWikiLog(
      this.app,
      `Lint | Bericht gespeichert in wiki/lint-report.md (Fehler: ${
        this.result.issues.filter((i) => i.severity === "error").length
      }, Warnungen: ${
        this.result.issues.filter((i) => i.severity === "warning").length
      }, Hinweise: ${this.result.issues.filter((i) => i.severity === "info").length})`,
    );
  }
}
