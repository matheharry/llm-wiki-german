import { App, Setting } from "obsidian";
import { openFolderPicker } from "../modal/folder-picker.js";

export interface QuerySettings {
  queryFolders: string[];
  queryMaxEntities: number;
  queryMaxConcepts: number;
  queryMaxConnections: number;
  queryMaxSources: number;
}

export function applyQuerySettingsPatch(
  prev: QuerySettings,
  patch: Partial<QuerySettings>,
): QuerySettings {
  return { ...prev, ...patch };
}

export interface BuildQuerySectionArgs {
  app: App;
  container: HTMLElement;
  settings: QuerySettings;
  onChange: (patch: Partial<QuerySettings>) => void | Promise<void>;
  rerender: () => void;
}

/** Begrenzung der Zahlenfelder: 0 heisst "keine". */
function clampCount(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/**
 * Punkt 5: Die Obergrenzen der Abfrage waren hart codiert
 * (MAX_ENTITIES = 8, MAX_CONCEPTS = 5, MAX_CONNECTIONS = 20) und
 * fuer `maxSources` gab es gar keine Grenze. Die Werte bestimmen
 * direkt, wie viel Kontext ans LLM geht — das sind Nutzer-Einstellungen,
 * keine Konstanten.
 */
function buildLimitSetting(
  args: BuildQuerySectionArgs,
  key: "queryMaxEntities" | "queryMaxConcepts" | "queryMaxConnections" | "queryMaxSources",
  name: string,
  desc: string,
  max: number,
): void {
  new Setting(args.container)
    .setName(name)
    .setDesc(desc)
    .addText((text) => {
      text.inputEl.type = "number";
      text.inputEl.min = "0";
      text.inputEl.max = String(max);
      text.setValue(String(args.settings[key]));
      text.onChange(async (raw) => {
        const parsed = Number.parseInt(raw, 10);
        const value = clampCount(Number.isNaN(parsed) ? 0 : parsed, 0, max);
        await args.onChange({ [key]: value });
      });
    });
}

export function buildQuerySection(args: BuildQuerySectionArgs): void {
  new Setting(args.container).setName("Abfrage").setHeading();

  const wholeVaultDesc =
    "Keine Ordnereinschränkung (Abfrage und Indizierung im gesamten Vault)";

  // Create a setting group for the query folder scope
  const settingGroup = args.container.createDiv({ cls: "setting-group" });

  // Heading with title and add button
  const heading = settingGroup.createDiv({ cls: "setting-item setting-item-heading" });
  const headingInfo = heading.createDiv({ cls: "setting-item-info" });
  headingInfo.createDiv({ cls: "setting-item-name", text: "Abfrage-Ordner" });
  headingInfo.createDiv({
    cls: "setting-item-description",
    text: "Gilt für Antworten und für den Umfang der Extraktions-Indizierung.",
  });
  const headingControl = heading.createDiv({ cls: "setting-item-control" });

  const addBtn = headingControl.createEl("button", {
    text: "Ordner hinzufügen…",
    cls: "mod-cta",
  });
  addBtn.addEventListener("click", () => {
    openFolderPicker({
      app: args.app,
      current: "",
      onPick: (folder) => {
        if (folder && !args.settings.queryFolders.includes(folder)) {
          void (async () => {
            await args.onChange({
              queryFolders: [...args.settings.queryFolders, folder],
            });
            args.rerender();
          })();
        }
      },
    });
  });

  // Items container for folders
  const itemsContainer = settingGroup.createDiv({ cls: "setting-items" });

  // "Gesamter Vault" anzeigen, wenn kein Ordner gewählt ist, sonst die Liste
  if (args.settings.queryFolders.length === 0) {
    const settingItem = itemsContainer.createDiv({ cls: "setting-item" });

    const settingInfo = settingItem.createDiv({ cls: "setting-item-info" });
    settingInfo.createDiv({ cls: "setting-item-name", text: "Gesamter Vault" });
    settingInfo.createDiv({ cls: "setting-item-description", text: wholeVaultDesc });
  } else {
    for (const folder of args.settings.queryFolders) {
      const settingItem = itemsContainer.createDiv({ cls: "setting-item" });

      const settingInfo = settingItem.createDiv({ cls: "setting-item-info" });
      settingInfo.createDiv({ cls: "setting-item-name", text: folder });

      const settingControl = settingItem.createDiv({ cls: "setting-item-control" });
      const removeBtn = settingControl.createEl("button", {
        text: "Entfernen",
        cls: "mod-warning",
      });

      removeBtn.addEventListener("click", () => {
        void (async () => {
          const filtered = args.settings.queryFolders.filter((f) => f !== folder);
          await args.onChange({ queryFolders: filtered });
          args.rerender();
        })();
      });
    }
  }

  // --- Obergrenzen der Abfrage (Punkt 5) ---------------------------------
  new Setting(args.container)
    .setName("Obergrenzen der Abfrage")
    .setDesc(
      "Wie viel Material eine einzelne Antwort heranziehen darf. Mehr bedeutet " +
        "mehr Kontext, mehr Tokens und langsamere Antworten. 0 deaktiviert die " +
        "jeweilige Kategorie vollständig.",
    )
    .setHeading();

  buildLimitSetting(
    args,
    "queryMaxEntities",
    "Maximale Entitäten",
    "Benannte Dinge (Personen, Werkzeuge, Organisationen), die pro Antwort " +
      "berücksichtigt werden.",
    50,
  );
  buildLimitSetting(
    args,
    "queryMaxConcepts",
    "Maximale Konzepte",
    "Konzepte, die pro Antwort berücksichtigt werden. Konzepte tragen die " +
      "Definitionen.",
    50,
  );
  buildLimitSetting(
    args,
    "queryMaxConnections",
    "Maximale Verbindungen",
    "Beziehungen zwischen den gefundenen Einträgen, die pro Antwort " +
      "einbezogen werden.",
    100,
  );
  buildLimitSetting(
    args,
    "queryMaxSources",
    "Maximale Quelldateien",
    "Quelldateien, die pro Antwort aufgeführt werden. Das ist der wichtigste " +
      "Hebel für die Antwortgröße: Jede Quelle bringt ihre vollständige " +
      "Zusammenfassung in den Prompt ein.",
    200,
  );
}
