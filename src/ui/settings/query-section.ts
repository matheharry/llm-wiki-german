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
  new Setting(args.container).setName("Query").setHeading();

  const wholeVaultDesc = "No folder restrictions (querying and indexing the entire vault)";

  // Create a setting group for the query folder scope
  const settingGroup = args.container.createDiv({ cls: "setting-group" });

  // Heading with title and add button
  const heading = settingGroup.createDiv({ cls: "setting-item setting-item-heading" });
  const headingInfo = heading.createDiv({ cls: "setting-item-info" });
  headingInfo.createDiv({ cls: "setting-item-name", text: "Query folders" });
  headingInfo.createDiv({
    cls: "setting-item-description",
    text: "Used for both answers and extraction indexing scope.",
  });
  const headingControl = heading.createDiv({ cls: "setting-item-control" });

  const addBtn = headingControl.createEl("button", {
    text: "Add folder…",
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

  // Display "Whole vault" when no folders are selected, or list of selected folders
  if (args.settings.queryFolders.length === 0) {
    const settingItem = itemsContainer.createDiv({ cls: "setting-item" });

    const settingInfo = settingItem.createDiv({ cls: "setting-item-info" });
    settingInfo.createDiv({ cls: "setting-item-name", text: "Whole vault" });
    settingInfo.createDiv({ cls: "setting-item-description", text: wholeVaultDesc });
  } else {
    for (const folder of args.settings.queryFolders) {
      const settingItem = itemsContainer.createDiv({ cls: "setting-item" });

      const settingInfo = settingItem.createDiv({ cls: "setting-item-info" });
      settingInfo.createDiv({ cls: "setting-item-name", text: folder });

      const settingControl = settingItem.createDiv({ cls: "setting-item-control" });
      const removeBtn = settingControl.createEl("button", {
        text: "Remove",
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
    .setName("Retrieval limits")
    .setDesc(
      "How much material a single answer may draw on. More means more context, " +
        "more tokens and slower answers. 0 disables that category entirely.",
    )
    .setHeading();

  buildLimitSetting(
    args,
    "queryMaxEntities",
    "Max entities",
    "Named things (people, tools, organisations) considered per answer.",
    50,
  );
  buildLimitSetting(
    args,
    "queryMaxConcepts",
    "Max concepts",
    "Concepts considered per answer. Concepts carry the definitions.",
    50,
  );
  buildLimitSetting(
    args,
    "queryMaxConnections",
    "Max connections",
    "Relations between the retrieved items included per answer.",
    100,
  );
  buildLimitSetting(
    args,
    "queryMaxSources",
    "Max source files",
    "Source files listed per answer. This is the main lever on answer size: " +
      "every source adds its full summary to the prompt.",
    200,
  );
}
