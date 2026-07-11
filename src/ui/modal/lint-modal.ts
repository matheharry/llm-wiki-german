import { App, Modal, Notice } from "obsidian";
import { KnowledgeBase } from "../../core/kb.js";
import { runLint, type LintResult, wordSimilarity } from "../../core/lint.js";
import { safeWritePage } from "../../vault/safe-write.js";
import { appendWikiLog } from "../../vault/wiki-log.js";
import type LlmWikiPlugin from "../../plugin.js";
import { deduplicateEntityFacts } from "../../core/dedupe.js";
import { saveKB, loadKB } from "../../vault/kb-store.js";
import { generatePages } from "../../pages/generator.js";

export function openLintModal(app: App, kb: KnowledgeBase, plugin: LlmWikiPlugin): void {
  new LintModal(app, kb, plugin).open();
}

class LintModal extends Modal {
  private result: LintResult;
  private isCleaning = false;

  constructor(
    app: App,
    private readonly kb: KnowledgeBase,
    private readonly plugin: LlmWikiPlugin,
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

    summaryEl.innerHTML = `Status: <b>${errors}</b> Fehler, <b>${warnings}</b> Warnungen, <b>${infos}</b> Hinweise.`;

    // Action buttons (Admin actions only)
    const btnContainer = contentEl.createDiv();
    btnContainer.style.marginBottom = "20px";
    btnContainer.style.display = "flex";
    btnContainer.style.gap = "10px";
    btnContainer.style.flexWrap = "wrap";

    const exportBtn = btnContainer.createEl("button", {
      text: "Bericht in wiki/lint-report.md speichern",
      cls: "mod-cta",
    });
    exportBtn.disabled = this.isCleaning;
    exportBtn.addEventListener("click", async () => {
      try {
        await this.exportReport();
        new Notice("Lint-Report erfolgreich in wiki/lint-report.md gespeichert.");
      } catch (err) {
        new Notice(`Fehler beim Speichern des Reports: ${(err as Error).message}`);
      }
    });

    const closeBtn = btnContainer.createEl("button", { text: "Schließen" });
    closeBtn.disabled = this.isCleaning;
    closeBtn.addEventListener("click", () => this.close());

    // Find entities with potential redundancies
    const entitiesWithRedundancies = this.kb.allEntities().filter(ent => {
      if (ent.facts.length < 2) return false;
      for (let i = 0; i < ent.facts.length; i++) {
        for (let j = i + 1; j < ent.facts.length; j++) {
          if (wordSimilarity(ent.facts[i], ent.facts[j]) >= 0.4) {
            return true;
          }
        }
      }
      return false;
    });

    // Find dangling connections
    const entityIds = new Set(this.kb.allEntities().map(e => e.id));
    const conceptIds = new Set(this.kb.allConcepts().map(c => c.id));
    const exists = (id: string) => entityIds.has(id) || conceptIds.has(id);
    const danglingConnections = this.kb.allConnections().filter(c => !exists(c.from) || !exists(c.to));

    // --- SECTION 1: Automatic Fixes ---
    if (entitiesWithRedundancies.length > 0 || danglingConnections.length > 0 || this.isCleaning) {
      const autoFixSection = contentEl.createDiv();
      autoFixSection.style.border = "1px solid var(--background-modifier-border-focus)";
      autoFixSection.style.borderRadius = "6px";
      autoFixSection.style.padding = "15px";
      autoFixSection.style.marginBottom = "20px";
      autoFixSection.style.backgroundColor = "var(--background-secondary-alt)";

      autoFixSection.createEl("h3", { text: "⚡ Automatische Fehlerbehebung" }).style.marginTop = "0px";
      
      const descText = autoFixSection.createEl("p", {
        text: "Einige der gefundenen Integritätsprobleme können direkt automatisch bereinigt werden. Wähle eine der folgenden Aktionen aus:",
      });
      descText.style.fontSize = "0.9em";
      descText.style.color = "var(--text-muted)";

      if (!this.isCleaning) {
        const actionBtnContainer = autoFixSection.createDiv();
        actionBtnContainer.style.display = "flex";
        actionBtnContainer.style.gap = "10px";
        actionBtnContainer.style.flexWrap = "wrap";

        if (entitiesWithRedundancies.length > 0) {
          const cleanBtn = actionBtnContainer.createEl("button", {
            text: `Redundante Fakten bereinigen (${entitiesWithRedundancies.length} Entitäten)`,
            cls: "mod-warning",
          });
          
          cleanBtn.addEventListener("click", async () => {
            this.isCleaning = true;
            this.onOpen(); // Re-render to show disabled state and progress UI
            
            const progressEl = contentEl.createDiv();
            progressEl.style.marginTop = "15px";
            progressEl.style.marginBottom = "15px";
            progressEl.style.padding = "12px";
            progressEl.style.backgroundColor = "var(--background-secondary)";
            progressEl.style.border = "1px solid var(--background-modifier-border)";
            progressEl.style.borderRadius = "4px";
            
            const statusText = progressEl.createEl("div", { text: `Bereinigung gestartet...` });
            statusText.style.fontWeight = "bold";
            
            const subStatusText = progressEl.createEl("div", { text: `` });
            subStatusText.style.fontSize = "0.9em";
            subStatusText.style.color = "var(--text-muted)";
            subStatusText.style.marginTop = "4px";

            try {
              let count = 0;
              for (const ent of entitiesWithRedundancies) {
                statusText.setText(`Bereinige Fakten: ${count + 1} von ${entitiesWithRedundancies.length} Entitäten`);
                subStatusText.setText(`Entität: "${ent.name}"`);
                
                const newFacts = await deduplicateEntityFacts(
                  this.plugin.provider,
                  this.plugin.activeModel,
                  ent.name,
                  ent.type,
                  ent.facts
                );
                
                ent.facts = newFacts;
                count++;
              }
              
              statusText.setText("Speichere Änderungen und aktualisiere Wiki...");
              subStatusText.setText("");
              
              await saveKB(this.app, this.kb, this.plugin.kbMtime);
              const reloaded = await loadKB(this.app);
              this.plugin.kbMtime = reloaded.mtime;
              await generatePages(this.app, this.kb);
              
              new Notice("Bereinigung erfolgreich abgeschlossen!");
            } catch (err) {
              new Notice(`Fehler bei der Bereinigung: ${(err as Error).message}`);
            } finally {
              this.isCleaning = false;
              // Refresh lint results and modal
              this.result = runLint(this.kb);
              this.onOpen();
            }
          });
        }

        if (danglingConnections.length > 0) {
          const cleanConnBtn = actionBtnContainer.createEl("button", {
            text: `Ungültige Verbindungen entfernen (${danglingConnections.length} Verbindungen)`,
            cls: "mod-warning",
          });

          cleanConnBtn.addEventListener("click", async () => {
            this.isCleaning = true;
            this.onOpen();

            try {
              // Filter connections to keep only those where both from and to exist
              this.kb.data.connections = this.kb.data.connections.filter(c => exists(c.from) && exists(c.to));

              await saveKB(this.app, this.kb, this.plugin.kbMtime);
              const reloaded = await loadKB(this.app);
              this.plugin.kbMtime = reloaded.mtime;
              await generatePages(this.app, this.kb);

              new Notice(`${danglingConnections.length} ungültige Verbindungen erfolgreich gelöscht!`);
            } catch (err) {
              new Notice(`Fehler beim Löschen der Verbindungen: ${(err as Error).message}`);
            } finally {
              this.isCleaning = false;
              this.result = runLint(this.kb);
              this.onOpen();
            }
          });
        }
      } else {
        // Cleaning in progress placeholder
        const cleanStatus = autoFixSection.createEl("div", { text: "Bereinigung läuft gerade..." });
        cleanStatus.style.fontWeight = "bold";
      }
    }

    // --- SECTION 2: Issues List ---
    contentEl.createEl("h3", { text: "📋 Gefundene Probleme & Hinweise" });
    const issuesDesc = contentEl.createEl("p", {
      text: "Die Liste zeigt alle Integritätsprobleme der Wissensdatenbank. Probleme mit dem Label '[Auto-Fix verfügbar]' können automatisch bereinigt werden. Andere müssen manuell in deinen Notizen behoben werden.",
    });
    issuesDesc.style.fontSize = "0.9em";
    issuesDesc.style.color = "var(--text-muted)";
    issuesDesc.style.marginBottom = "10px";

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
        header.style.alignItems = "center";
        header.style.fontWeight = "bold";

        const leftHeader = header.createDiv();
        leftHeader.style.display = "flex";
        leftHeader.style.alignItems = "center";
        leftHeader.style.gap = "8px";

        const badge = leftHeader.createSpan({ text: issue.severity.toUpperCase() });
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

        const title = leftHeader.createSpan({ text: `[${issue.category}] ${issue.message}` });

        // Add Auto-Fix status label
        const isAutofixable = 
          (issue.category === "Duplikate" && issue.message.startsWith("Mögliche redundante Fakten")) ||
          (issue.category === "Verbindungen" && (issue.message.startsWith("Ungültiger Ausgangspunkt") || issue.message.startsWith("Ungültiges Ziel")));
        const fixLabel = header.createSpan();
        fixLabel.style.padding = "2px 6px";
        fixLabel.style.borderRadius = "3px";
        fixLabel.style.fontSize = "0.75em";

        if (isAutofixable) {
          fixLabel.setText("Auto-Fix verfügbar");
          fixLabel.style.backgroundColor = "var(--text-success)";
          fixLabel.style.color = "#fff";
        } else {
          fixLabel.setText("Manuell beheben");
          fixLabel.style.backgroundColor = "var(--background-modifier-border)";
          fixLabel.style.color = "var(--text-muted)";
        }

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
