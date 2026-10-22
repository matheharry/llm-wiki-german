/**
 * Regeneriert die Wiki-Seiten aus `knowledge.json` — OHNE LLM-Aufrufe.
 *
 * Das ist der Befehl "Seiten aus Wissensdatenbank neu generieren" des
 * Plugins, ausserhalb von Obsidian ausfuehrbar. Noetig, um die Fixes
 * (YAML-Frontmatter, `erstellt`/`aktualisiert`, tote Links auf
 * Quellseiten) auf dem Live-Wiki anzuwenden, ohne einen
 * Extraktionslauf zu starten.
 *
 * Aufruf:
 *   npx tsx scripts/regenerate-wiki.ts <vault-root>
 *
 * Vorsicht: Schreibt ~10.000 Dateien. Das Vault ist ein Git-Repo —
 * vor dem Lauf `git status` pruefen, danach den Diff ansehen.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { KnowledgeBase } from "../src/core/kb.js";
import { generatePages } from "../src/pages/generator.js";
import { listPagePaths, type SafeWriteApp } from "../src/vault/safe-write.js";

const vaultRoot = resolve(process.argv[2] ?? ".");
const kbPath = join(vaultRoot, "wiki", "knowledge.json");

if (!existsSync(kbPath)) {
  console.error(`knowledge.json nicht gefunden: ${kbPath}`);
  process.exit(1);
}

/** Minimale App-Implementierung auf Basis des Dateisystems. */
const app: SafeWriteApp = {
  vault: {
    configDir: ".obsidian",
    adapter: {
      async exists(path: string): Promise<boolean> {
        return existsSync(join(vaultRoot, path));
      },
      async read(path: string): Promise<string> {
        return readFileSync(join(vaultRoot, path), "utf-8");
      },
      async write(path: string, content: string): Promise<void> {
        const full = join(vaultRoot, path);
        mkdirSync(dirname(full), { recursive: true });
        writeFileSync(full, content, "utf-8");
      },
      async mkdir(path: string): Promise<void> {
        mkdirSync(join(vaultRoot, path), { recursive: true });
      },
      async list(path: string): Promise<{ files: string[]; folders: string[] }> {
        const full = join(vaultRoot, path);
        if (!existsSync(full)) return { files: [], folders: [] };
        const { readdirSync } = await import("node:fs");
        const entries = readdirSync(full, { withFileTypes: true });
        // Obsidian gibt die Pfade mit einem abschliessenden "/" fuer
        // Ordner zurueck — `collectMdFiles()` haengt sich genau daran
        // an, wenn es in Unterordner geht. Ohne den Slash entstehen
        // Pfade wie "wiki/sourcesBücher" und der Abgleich mit den
        // geschriebenen Seiten schlaegt fehl.
        const base = path.endsWith("/") ? path : `${path}/`;
        return {
          files: entries
            .filter((e) => e.isFile())
            .map((e) => `${base}${e.name}`),
          folders: entries
            .filter((e) => e.isDirectory())
            .map((e) => `${base}${e.name}/`),
        };
      },
      async remove(path: string): Promise<void> {
        const { unlinkSync } = await import("node:fs");
        const full = join(vaultRoot, path);
        if (!existsSync(full)) return;
        // Antivirus und der Windows-Indexer halten Dateien gelegentlich
        // kurz offen (EBUSY). Ein paar Versuche mit Pause loesen das.
        for (let attempt = 0; attempt < 5; attempt++) {
          try {
            unlinkSync(full);
            return;
          } catch (e) {
            if ((e as NodeJS.ErrnoException).code !== "EBUSY") throw e;
            await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
          }
        }
        console.warn(`  nicht loeschbar (EBUSY): ${path}`);
      },
    },
  },
};

const raw = JSON.parse(readFileSync(kbPath, "utf-8"));
const kb = new KnowledgeBase(raw);

console.log(
  `KB geladen: ${Object.keys(kb.data.entities).length} Entitaeten, ` +
    `${Object.keys(kb.data.concepts).length} Konzepte, ` +
    `${Object.keys(kb.data.sources).length} Quellen`,
);

// ---------------------------------------------------------------------------
// SICHERHEITSNETZ
//
// `generatePages()` loescht am Ende jede Seite, die es nicht selbst
// geschrieben hat. Das ist das richtige Verhalten im Plugin — im
// Obsidian-Kontext ist der Bestand die Wahrheit. In einem Skript gegen
// ein echtes Vault ist es aber eine Gefahr: ein Fehler im `list()`-Adapter
// liefert eine leere Liste, und dann loescht der Prune-Schritt 11.000
// Seiten.
//
// Deshalb: der Abgleich zwischen "geschrieben" und "vorhanden" wird
// VOR dem Loeschen geprueft. Stimmt er nicht, bricht das Skript ab.
// ---------------------------------------------------------------------------
const pageDirs = ["wiki/entities/", "wiki/concepts/", "wiki/sources/"];
let existingCount = 0;
for (const dir of pageDirs) {
  // `listPagePaths()` zaehlt rekursiv — `adapter.list()` liefert nur die
  // direkten Kinder, und die Quellseiten liegen in Unterordnern.
  existingCount += (await listPagePaths(app, dir)).length;
}

const kbEntryCount =
  Object.keys(kb.data.entities).length +
  Object.keys(kb.data.concepts).length +
  Object.keys(kb.data.sources).length;

if (existingCount === 0) {
  console.error(
    "SICHERHEITSABBRUCH: Es wurden 0 vorhandene Wiki-Seiten gefunden.\n" +
      "Der list()-Adapter liefert vermutlich leere Ergebnisse — das Skript\n" +
      "wuerde im Prune-Schritt jede Seite loeschen.",
  );
  process.exit(1);
}

if (existingCount < kbEntryCount * 0.5) {
  console.error(
    `SICHERHEITSABBRUCH: ${existingCount} vorhandene Seiten, aber ${kbEntryCount} KB-Eintraege.\n` +
      "Das Verhaeltnis ist unplausibel — der list()-Adapter arbeitet vermutlich\n" +
      "falsch. Abbruch, bevor Seiten geloescht werden.",
  );
  process.exit(1);
}

console.log(`Vorhandene Wiki-Seiten: ${existingCount}`);

// ---------------------------------------------------------------------------
// VERWAISTE QUELLEN-RECORDS ENTFERNEN
//
// 405 Seiten zitierten Quellen, deren Datei es nicht mehr gibt. Die
// Dateien sind geloescht oder verschoben — die Records im KB sind es
// nicht. Jede Zitation zeigt ins Leere.
//
// WICHTIG: nur Pfade im QUERY-SCOPE werden entfernt. `Buecher/` ist
// nicht Teil von `queryFolders`; ein Record dort ist nicht "verwaist",
// sondern "nicht gescannt". Die Datei existiert, sie wird nur nicht
// extrahiert — ihr Record muss erhalten bleiben.
//
// Der Scope wird aus der Plugin-Konfiguration gelesen
// (`.obsidian/plugins/llm-wiki-german/data.json` -> `queryFolders`).
// Ohne Konfiguration wird NICHT entfernt — lieber zu wenig als zu viel.
// ---------------------------------------------------------------------------
const scope: string[] = (() => {
  const cfgPath = join(
    vaultRoot,
    ".obsidian",
    "plugins",
    "llm-wiki-german",
    "data.json",
  );
  if (!existsSync(cfgPath)) {
    console.log(
      "Keine Plugin-Konfiguration gefunden — verwaiste Quellen werden NICHT entfernt.",
    );
    return [];
  }
  try {
    const cfg = JSON.parse(readFileSync(cfgPath, "utf-8"));
    const folders = cfg?.queryFolders;
    return Array.isArray(folders) ? folders.map((f: unknown) => String(f)) : [];
  } catch {
    return [];
  }
})();

const inScope = (path: string): boolean => {
  if (scope.length === 0) return false;
  const clean = path.replace(/\\/g, "/");
  return scope.some((folder) => {
    const f = folder.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
    if (!f) return true;
    return clean === f || clean.startsWith(`${f}/`);
  });
};

if (scope.length > 0) {
  const orphaned = Object.keys(kb.data.sources).filter(
    (path) =>
      inScope(path) && !existsSync(join(vaultRoot, path)),
  );
  const removed = kb.removeOrphanedSources(orphaned);
  console.log(
    `Verwaiste Quellen-Records: ${removed} entfernt ` +
      `(von ${orphaned.length} verwaisten Pfaden im Scope ${scope.join(", ")})`,
  );
  if (removed > 0) {
    // Das KB zurueckschreiben, damit die bereinigten Records dauerhaft
    // sind. Die Seiten werden danach neu gerendert.
    writeFileSync(
      kbPath,
      JSON.stringify(kb.data, null, 2),
      "utf-8",
    );
    console.log("knowledge.json aktualisiert.");
  }
} else {
  console.log(
    "Kein Query-Scope konfiguriert — verwaiste Quellen bleiben erhalten " +
      "(sie werden beim naechsten Extraktionslauf im Plugin bereinigt).",
  );
}

const result = await generatePages(app, kb);
console.log(
  `Fertig: ${result.written} Seiten geschrieben, ${result.deleted} geloescht, ` +
    `${result.filtered.length} Eintraege vom Qualitaetsfilter verworfen.`,
);
