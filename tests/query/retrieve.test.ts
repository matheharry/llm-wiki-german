import { describe, expect, it } from "vitest";

import { KnowledgeBase } from "../../src/core/kb.js";
import { retrieve } from "../../src/query/retrieve.js";

function buildSampleKB() {
  const kb = new KnowledgeBase();
  kb.addEntity({
    name: "Alan Watts",
    type: "person",
    aliases: ["Watts"],
    facts: [
      "British philosopher",
      "Wrote The Way of Zen",
      "Lectured on Eastern philosophy",
    ],
    source: "Books/Watts.md",
  });
  kb.addEntity({
    name: "Andrej Karpathy",
    type: "person",
    aliases: [],
    facts: ["AI researcher", "Stanford alum", "Wrote Software 2.0"],
    source: "Learn/Karpathy.md",
  });
  kb.addEntity({
    name: "exact name",
    type: "other",
    aliases: [],
    facts: ["should be hidden"],
    source: "x.md",
  });
  kb.addConcept({
    name: "Zen",
    definition: "A school of Mahayana Buddhism",
    related: ["meditation"],
    source: "Books/Watts.md",
  });
  return kb;
}

describe("retrieve", () => {
  it("returns Alan Watts on top for 'who is alan watts'", () => {
    const kb = buildSampleKB();
    const bundle = retrieve({ question: "who is Alan Watts", kb });
    expect(bundle.entities[0]?.name).toBe("Alan Watts");
    expect(bundle.queryType).toBe("entity_lookup");
  });

  it("never returns blacklisted entities", () => {
    const kb = buildSampleKB();
    const bundle = retrieve({ question: "exact name", kb });
    expect(bundle.entities.find((e) => e.name === "exact name")).toBeUndefined();
  });

  it("respects folder scope", () => {
    const kb = buildSampleKB();
    const bundle = retrieve({
      question: "philosopher",
      kb,
      folders: ["Learn"],
    });
    expect(bundle.entities.find((e) => e.name === "Alan Watts")).toBeUndefined();
  });

  it("retrieves source files when searching for source title or summary", () => {
    const kb = buildSampleKB();
    kb.markSource({
      path: "Beispieldateien/Whiteboards für den Unterricht.md",
      summary: "15 Online-Whiteboard-Optionen für den Unterricht",
      mtime: 12345,
      origin: "user-note",
    });

    const bundle = retrieve({ question: "Gib eine Übersicht zu Whiteboards", kb });
    expect(bundle.sources.some((s) => s.id.includes("Whiteboards"))).toBe(true);
  });
});
