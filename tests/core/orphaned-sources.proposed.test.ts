/**
 * BEWEIS: verwaiste Source-Records werden erkannt und entfernt.
 *
 * Hintergrund: Im Live-Vault zeigten 46 Source-Records auf Dateien, die
 * es nicht (mehr) gab (24 geloescht, 16 `Buecher/`-Symlink, 6 verschoben).
 * Jede Wiki-Seite, die einen solchen Record zitiert, verweist ins Leere.
 *
 * Der knifflige Teil: "existiert nicht" ist nicht dasselbe wie "wird
 * nicht gescannt". Eine Datei ausserhalb des Query-Scopes (z.B.
 * `Buecher/`) existiert, wird aber nicht extrahiert — ihr Record muss
 * erhalten bleiben. Wird er entfernt, verliert der KB-Eintrag eine
 * Quelle, die es gibt.
 */
import { describe, it, expect } from "vitest";
import { walkVault, type WalkOptions } from "../../src/vault/walker.js";
import { KnowledgeBase } from "../../src/core/kb.js";
import { createMockApp } from "../helpers/mock-app.js";

const opts: WalkOptions = {
  skipDirs: ["wiki", ".obsidian", "Template", "Assets", ".trash"],
  includeFolders: ["Clippings", "Notizen"],
  minFileSize: 50,
  dailiesFromIso: "2026-04-05",
};

describe("Walker: verwaiste Source-Records", () => {
  it("meldet nur Pfade, die es nicht mehr gibt", () => {
    const { app } = createMockApp([
      {
        path: "Clippings/present.md",
        content: "x".repeat(100),
        mtime: 1700000000,
        ctime: 1700000000,
      },
    ]);
    const walk = walkVault(app, {
      ...opts,
      knownSourcePaths: [
        "Clippings/present.md",
        "Clippings/geloescht.md",
      ],
    });
    expect(walk.orphanedSourcePaths).toEqual(["Clippings/geloescht.md"]);
  });

  it("meldet NICHTS fuer Quellen ausserhalb des Query-Scopes", () => {
    // `Buecher/` ist nicht Teil von `includeFolders`. Ein Record fuer
    // eine Datei dort ist nicht "verwaist" — sie existiert, wird nur
    // nicht gescannt.
    const { app } = createMockApp([]);
    const walk = walkVault(app, {
      ...opts,
      knownSourcePaths: [
        "Buecher/Engelke ChatGPT & Co.md",
        "Buecher/Anderes Buch.md",
      ],
    });
    expect(walk.orphanedSourcePaths).toEqual([]);
  });

  it("meldet nichts, wenn keine knownSourcePaths uebergeben werden", () => {
    const { app } = createMockApp([]);
    const walk = walkVault(app, opts);
    expect(walk.orphanedSourcePaths).toEqual([]);
  });

  it("meldet nichts fuer Pfade in ausgeschlossenen Ordnern", () => {
    const { app } = createMockApp([]);
    const walk = walkVault(app, {
      ...opts,
      knownSourcePaths: ["wiki/entities/x.md", "Notizen/ok.md"],
    });
    expect(walk.orphanedSourcePaths).toEqual(["Notizen/ok.md"]);
  });
});

describe("KB: removeOrphanedSources", () => {
  it("entfernt den Record und die Verweise darauf", () => {
    const kb = new KnowledgeBase();
    kb.markSource({
      path: "Clippings/weg.md",
      mtime: 1,
      origin: "user-note",
      summary: "Eine Quelle",
    });
    kb.markSource({
      path: "Clippings/bleibt.md",
      mtime: 2,
      origin: "user-note",
      summary: "Eine andere Quelle",
    });
    kb.addEntity({
      name: "Alan Watts",
      type: "person",
      facts: ["Alan Watts war ein Autor."],
      source: "Clippings/bleibt.md",
    });
    kb.addEntity({
      name: "Nur von der Weg-Quelle",
      type: "person",
      facts: ["Existiert nur wegen der entfernten Quelle."],
      source: "Clippings/weg.md",
    });

    const removed = kb.removeOrphanedSources(["Clippings/weg.md"]);
    expect(removed).toBe(1);
    // Der Record ist weg...
    expect(kb.data.sources["Clippings/weg.md"]).toBeUndefined();
    // ...der Eintrag bleibt aber erhalten: die Zitation verschwindet,
    // nicht das Wissen. Wuerde der Eintrag geloescht, verliert die
    // Seite ihren Inhalt — und alle Verweise auf sie werden tot.
    const survivor = kb.getEntity("nur-von-der-weg-quelle");
    expect(survivor).toBeDefined();
    expect(survivor!.facts).toEqual(["Existiert nur wegen der entfernten Quelle."]);
    expect(survivor!.sources).toEqual([]);
    // Der Eintrag mit einer lebenden Quelle bleibt unveraendert.
    expect(kb.getEntity("alan-watts")).toBeDefined();
    expect(kb.getEntity("alan-watts")!.sources).toEqual(["Clippings/bleibt.md"]);
    expect(kb.data.sources["Clippings/bleibt.md"]).toBeDefined();
  });

  it("zaehlt nur tatsaechlich entfernte Records", () => {
    const kb = new KnowledgeBase();
    kb.markSource({
      path: "Clippings/a.md",
      mtime: 1,
      origin: "user-note",
      summary: "x",
    });
    // Pfad, der gar kein Record ist -> nichts zu entfernen.
    const removed = kb.removeOrphanedSources([
      "Clippings/a.md",
      "Clippings/unbekannt.md",
    ]);
    expect(removed).toBe(1);
  });

  it("entfernt Verbindungen, die nur an der Quelle haengen", () => {
    const kb = new KnowledgeBase();
    kb.markSource({
      path: "Clippings/weg.md",
      mtime: 1,
      origin: "user-note",
      summary: "x",
    });
    kb.addEntity({
      name: "A",
      type: "other",
      facts: ["Fakt A."],
      source: "Clippings/weg.md",
    });
    kb.addEntity({
      name: "B",
      type: "other",
      facts: ["Fakt B."],
      source: "Clippings/weg.md",
    });
    kb.addConnection({
      from: "a",
      to: "b",
      type: "related-to",
      description: "A steht mit B in Verbindung.",
      source: "Clippings/weg.md",
    });
    expect(kb.data.connections.length).toBe(1);

    kb.removeOrphanedSources(["Clippings/weg.md"]);
    // Die Verbindung verwaist ebenfalls — sie zeigt auf zwei Eintraege,
    // die es nicht mehr gibt.
    expect(kb.data.connections.length).toBe(0);
  });
});
