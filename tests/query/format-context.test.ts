import { describe, it, expect } from "vitest";
import { formatContextMarkdown } from "../../src/query/format-context.js";
import type { RetrievedBundle } from "../../src/query/types.js";

const BUNDLE: RetrievedBundle = {
  question: "zen",
  queryType: "conceptual",
  entities: [
    {
      id: "alan-watts",
      name: "Alan Watts",
      type: "person",
      aliases: ["Watts"],
      facts: ["British philosopher", "Wrote The Way of Zen"],
      sources: ["Books/Watts.md"],
    },
  ],
  concepts: [
    {
      id: "zen",
      name: "Zen",
      definition: "A school of Mahayana Buddhism",
      related: ["meditation"],
      sources: ["Books/Watts.md"],
    },
  ],
  connections: [
    {
      from: "Alan Watts",
      to: "Zen",
      type: "influences",
      description: "Watts brought Zen to the West",
      sources: ["Books/Watts.md"],
    },
  ],
  sources: [{ id: "Books/Watts.md", summary: "Watts notes" }],
};

describe("formatContextMarkdown", () => {
  it("emits all four sections in order", () => {
    const md = formatContextMarkdown(BUNDLE);
    const order = ["## ENTITÄTEN", "## KONZEPTE", "## VERBINDUNGEN", "## QUELLDATEIEN"];
    let lastIdx = -1;
    for (const h of order) {
      const idx = md.indexOf(h);
      expect(idx).toBeGreaterThan(lastIdx);
      lastIdx = idx;
    }
  });

  it("includes facts, aliases, and source paths", () => {
    const md = formatContextMarkdown(BUNDLE);
    expect(md).toContain("Andere Namen: Watts");
    expect(md).toContain("- British philosopher");
    expect(md).toContain("Quellen: Books/Watts.md");
    expect(md).toContain("Verwandt mit: meditation");
  });

  it("omits empty sections", () => {
    const empty: RetrievedBundle = {
      ...BUNDLE,
      entities: [],
      concepts: [],
      connections: [],
      sources: [],
    };
    const md = formatContextMarkdown(empty);
    expect(md).not.toContain("##");
  });
});
