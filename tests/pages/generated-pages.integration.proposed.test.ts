/**
 * INTEGRATIONSTEST: die erzeugten Wiki-Seiten.
 *
 * Dieser Test schliesst die Luecke aus Verbesserung 3.3: 636 Tests
 * bestanden, aber KEINER davon pruefte, ob die gerenderten Seiten
 * untereinander aufloesbare Links enthalten und ob das erzeugte
 * Frontmatter parsebar ist. Genau deshalb fiel der `yamlScalar`-Fehler
 * durch alle gruenen Tests: 43 Seiten bekamen ungueltiges YAML.
 *
 * Der Test schreibt das komplette Wiki in ein temporaeres Vault,
 * sammelt alle `[[links]]`, loest sie gegen die tatsaechlich
 * geschriebenen Dateien auf und meldet:
 *   - tote Links (Verweis auf eine Datei, die es nicht gibt)
 *   - unparsebares Frontmatter
 *   - Verweise auf Eintraege, die der Qualitaetsfilter verworfen hat
 */
import { describe, it, expect } from "vitest";
import YAML from "yaml";
import { generatePages } from "../../src/pages/generator.js";
import { KnowledgeBase } from "../../src/core/kb.js";
import { createMockApp } from "../helpers/mock-app.js";

/** Alle Wikilinks einer Seite: `[[ziel]]` und `[[ziel|label]]`. */
function extractLinks(content: string): Array<{ target: string; line: number }> {
  const links: Array<{ target: string; line: number }> = [];
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Frontmatter auslassen — dort stehen Pfade, keine Links.
    if (i === 0 && line.trim() === "---") {
      let j = i + 1;
      while (j < lines.length && lines[j].trim() !== "---") j++;
      i = j;
      continue;
    }
    const re = /\[\[([^\]]+)\]\]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
      const inner = m[1];
      // `[[ziel|label]]` -> Ziel ist vor dem Pipe.
      const target = (inner.split("|")[0] ?? "").trim();
      // Anker (`[[datei#abschnitt]]`) und Blöcke (`[[datei#^block]]`).
      const base = target.split("#")[0].trim();
      if (base) links.push({ target: base, line: i + 1 });
    }
  }
  return links;
}

/** Frontmatter eines Markdown-Dokuments als Objekt. */
function parseFrontmatter(content: string): Record<string, unknown> | null {
  if (!content.startsWith("---")) return null;
  const end = content.indexOf("\n---", 3);
  if (end === -1) return null;
  const block = content.slice(content.indexOf("\n") + 1, end);
  try {
    const parsed: unknown = YAML.parse(block);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * Baut eine KB, die alle relevanten Pfade abdeckt:
 * - Entities und Konzepte, die den Qualitaetsfilter passieren
 * - Entities und Konzepte, die er verwirft (dürfen nicht verlinkt werden)
 * - Verbindungen in beide Richtungen
 * - `related`-Verweise auf existierende und auf nicht existierende Ziele
 * - Quellen
 */
function buildKb(): KnowledgeBase {
  const kb = new KnowledgeBase();

  kb.addEntity({
    name: "Alan Watts",
    type: "person",
    facts: ["Alan Watts war ein britisch-orthodoxer Autor."],
    source: "Books/Watts.md",
  });
  kb.addEntity({
    name: "Zen Buddhism",
    type: "other",
    facts: ["Nicht typisierter Platzhalter."],
    source: "Books/Watts.md",
  });
  kb.addEntity({
    name: "Obsidian",
    type: "tool",
    facts: ["Obsidian ist ein Markdown-Editor."],
    source: "Learn/Obsidian.md",
  });
  kb.addEntity({
    name: "Verworfene Entitaet",
    type: "person",
    facts: [],
    source: "Learn/Verworfen.md",
  });

  kb.addConcept({
    name: "Zen Buddhism",
    definition: "Eine philosophische Tradition.",
    related: ["Alan Watts", "Obsidian", "Nicht vorhandenes Konzept"],
    source: "Books/Watts.md",
  });
  kb.addConcept({
    name: "Obsidian",
    definition: "Ein Markdown-Editor mit Wikilinks.",
    related: ["Alan Watts"],
    source: "Learn/Obsidian.md",
  });
  // Ohne Definition -> vom Qualitaetsfilter verworfen.
  kb.addConcept({
    name: "Konzept ohne Definition",
    definition: "",
    related: ["Alan Watts"],
    source: "Learn/Verworfen.md",
  });

  kb.markSource({ path: "Books/Watts.md", mtime: 1, origin: "user-note", summary: "Notizen zu Watts" });
  kb.markSource({ path: "Learn/Obsidian.md", mtime: 2, origin: "user-note", summary: "Notizen zu Obsidian" });
  kb.markSource({ path: "Learn/Verworfen.md", mtime: 3, origin: "user-note", summary: "Verworfen" });

  kb.addConnection({
    from: "alan-watts",
    to: "zen-buddhism",
    type: "related-to",
    description: "Watts schreibt ueber Zen-Buddhismus.",
    source: "Books/Watts.md",
  });
  kb.addConnection({
    from: "obsidian",
    to: "alan-watts",
    type: "related-to",
    description: "Verbindung Obsidian -> Watts.",
    source: "Learn/Obsidian.md",
  });
  // Ziel existiert gar nicht im KB.
  kb.addConnection({
    from: "alan-watts",
    to: "gibt-es-nicht",
    type: "mentions" as never,
    description: "Verbindung ins Leere.",
    source: "Books/Watts.md",
  });

  return kb;
}

describe("INTEGRATION: erzeugte Seiten", () => {
  it("erzeugt nur parsebares YAML im Frontmatter", async () => {
    const { app, files } = createMockApp();
    await generatePages(app, buildKb());

    const failures: string[] = [];
    for (const [path, file] of files) {
      if (!path.endsWith(".md")) continue;
      const fm = parseFrontmatter(file.content);
      if (fm === null) {
        failures.push(`${path}: Frontmatter nicht parsebar`);
      }
    }
    expect(failures).toEqual([]);
  });

  it("erzeugt keine toten Wikilinks", async () => {
    const kb = buildKb();
    // Der echte Ablauf loest die related-Verweise VOR dem Rendern auf
    // (plugin.ts: resolveAllRelated()). Ohne diesen Schritt stehen in
    // `related` noch freie Namen statt IDs.
    kb.resolveAllRelated();

    const { app, files } = createMockApp();
    await generatePages(app, kb);

    // Menge aller geschriebenen Dateien (Pfad ohne .md).
    const written = new Set<string>();
    for (const path of files.keys()) {
      written.add(path.endsWith(".md") ? path.slice(0, -3) : path);
    }

    // Quellverweise im Format `[[Books/Watts.md]]` zeigen auf eine echte
    // Datei IM VAULT (nicht auf die generierte Quellseite unter
    // wiki/sources/). Obsidian loest sie ueber den Pfad auf.
    const sourceStems = new Set<string>();
    for (const w of written) {
      if (w.startsWith("wiki/sources/")) {
        sourceStems.add(w.replace(/^wiki\/sources\//, "").replace(/\.md$/, ""));
      }
    }
    // Die Quellpfade, die es als echte Vault-Dateien gibt.
    const vaultFiles = new Set([
      "Books/Watts.md",
      "Learn/Obsidian.md",
      "Learn/Verworfen.md",
    ]);

    const dead: string[] = [];
    for (const [path, file] of files) {
      if (!path.endsWith(".md")) continue;
      for (const link of extractLinks(file.content)) {
        const target = link.target;
        const bare = target.includes("/") ? target.split("/").pop()! : target;
        const known =
          written.has(target) ||
          written.has(target.replace(/\.md$/, "")) ||
          // Verweis auf eine generierte Quellseite: `[[wiki/sources/X.md]]`
          sourceStems.has(target.replace(/^wiki\/sources\//, "").replace(/\.md$/, "")) ||
          // Verweis auf eine echte Vault-Datei: `[[Books/Watts.md]]`
          vaultFiles.has(target) ||
          [...written].some((w) => w.endsWith(`/${bare}`) || w.endsWith(`/${bare}.md`));
        if (!known) {
          dead.push(`${path}:${link.line} -> [[${link.target}]]`);
        }
      }
    }
    expect(dead).toEqual([]);
  });

  it("verlinkt keine Eintraege, die der Qualitaetsfilter verworfen hat", async () => {
    const { app, files } = createMockApp();
    await generatePages(app, buildKb());

    const written = new Set<string>();
    for (const path of files.keys()) {
      written.add(path.endsWith(".md") ? path.slice(0, -3) : path);
    }

    // Diese beiden sind bewusst verworfen worden.
    expect(written.has("wiki/entities/verworfene-entitaet")).toBe(false);
    expect(written.has("wiki/concepts/konzept-ohne-definition")).toBe(false);

    const linksToDiscarded: string[] = [];
    for (const [path, file] of files) {
      if (!path.endsWith(".md")) continue;
      for (const link of extractLinks(file.content)) {
        if (link.target.includes("verworfene-entitaet") || link.target.includes("konzept-ohne-definition")) {
          linksToDiscarded.push(`${path} -> [[${link.target}]]`);
        }
      }
    }
    expect(linksToDiscarded).toEqual([]);
  });

  it("laesst jede erzeugte Seite im Index auffindbar sein", async () => {
    const { app, files } = createMockApp();
    await generatePages(app, buildKb());

    const index = files.get("wiki/index.md");
    expect(index).toBeDefined();
    const indexContent = index!.content;

    const missing: string[] = [];
    for (const path of files.keys()) {
      if (!path.startsWith("wiki/entities/") && !path.startsWith("wiki/concepts/")) continue;
      const id = path.replace(/^wiki\/(?:entities|concepts)\//, "").replace(/\.md$/, "");
      // Der Index verweist mit dem Pfadpraefix `wiki/entities/<id>`.
      if (!indexContent.includes(`wiki/entities/${id}|`) && !indexContent.includes(`wiki/concepts/${id}|`)) {
        missing.push(path);
      }
    }
    expect(missing).toEqual([]);
  });
});
