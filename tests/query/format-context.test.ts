import { describe, it, expect } from "vitest";
import {
  formatContextMarkdown,
  DEFAULT_CONTEXT_BUDGET,
  type ContextBudget,
} from "../../src/query/format-context.js";
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
      from: "alan-watts",
      to: "zen",
      type: "influences",
      description: "Watts brought Zen to the West",
      sources: ["Books/Watts.md"],
    },
  ],
  sources: [
    {
      id: "Books/Watts.md",
      summary: "Watts notes",
      date: "2024-01-01",
      mtime: 1700000000000,
      origin: "user-note",
    },
  ],
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

  it("includes facts, aliases, and source names", () => {
    const md = formatContextMarkdown(BUNDLE);
    expect(md).toContain("Andere Namen: Watts");
    expect(md).toContain("- British philosopher");
    // Punkt 1a: nur der Dateiname, nicht der volle Pfad. Der volle
    // Pfad war der groesste Ballast im Prompt.
    expect(md).toContain("Quellen: Watts.md");
    expect(md).not.toContain("Quellen: Books/Watts.md");
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

  it("prioritizes facts matching the question when entity has many facts", () => {
    const bundleWithManyFacts: RetrievedBundle = {
      ...BUNDLE,
      question: "Was ist über Meditation bekannt?",
      entities: [
        {
          id: "e1",
          name: "Teacher",
          type: "person",
          aliases: [],
          facts: [
            "Lived in Zurich",
            "Traveled to India",
            "Taught meditation techniques daily",
            "Born in 1950",
            "Spoke German and French",
            "Wrote poetry",
            "Enjoyed gardening",
          ],
          sources: ["t.md"],
        },
      ],
    };
    const md = formatContextMarkdown(bundleWithManyFacts);
    // The meditation fact should appear first in the list
    const firstFactMatch = md.match(/- (.+)/);
    expect(firstFactMatch?.[1]).toBe("Taught meditation techniques daily");
  });

  // --- Punkt 1b: IDs -> lesbare Namen -------------------------------------
  it("shows readable names for `related` instead of slugs", () => {
    const withNames: RetrievedBundle = {
      ...BUNDLE,
      nameById: new Map([["meditation", "Meditation"]]),
    };
    const md = formatContextMarkdown(withNames);
    expect(md).toContain("Verwandt mit: Meditation");
    expect(md).not.toContain("Verwandt mit: meditation");
  });

  it("shows readable names for connection endpoints", () => {
    const withNames: RetrievedBundle = {
      ...BUNDLE,
      nameById: new Map([
        ["alan-watts", "Alan Watts"],
        ["zen", "Zen"],
      ]),
    };
    const md = formatContextMarkdown(withNames);
    expect(md).toContain("Alan Watts → Zen (influences)");
  });

  it("falls back to the raw id when no name is known", () => {
    const md = formatContextMarkdown(BUNDLE);
    expect(md).toContain("alan-watts → zen (influences)");
  });

  // --- Punkt 2: Budget je Abschnitt ---------------------------------------
  it("keeps every section when the budget allows it", () => {
    const md = formatContextMarkdown(BUNDLE);
    for (const h of ["## ENTITÄTEN", "## KONZEPTE", "## VERBINDUNGEN", "## QUELLDATEIEN"]) {
      expect(md).toContain(h);
    }
    expect(md).not.toContain("gekürzt");
  });

  it("truncates only the section that exceeds its budget", () => {
    const manyEntities: RetrievedBundle = {
      ...BUNDLE,
      entities: Array.from({ length: 40 }, (_, i) => ({
        id: `e${i}`,
        name: `Entity ${i}`,
        type: "person" as const,
        aliases: [],
        facts: [`Fact number ${i} with some text to take up space.`],
        sources: ["a.md", "b.md", "c.md"],
      })),
    };
    const budget: ContextBudget = {
      ...DEFAULT_CONTEXT_BUDGET,
      entities: 300,
    };
    const md = formatContextMarkdown(manyEntities, budget);
    // Die Entities sind gekuerzt ...
    expect(md).toContain("gekürzt");
    // ... aber die anderen Abschnitte sind vollstaendig.
    expect(md).toContain("## KONZEPTE");
    expect(md).toContain("## VERBINDUNGEN");
    expect(md).toContain("## QUELLDATEIEN");
    expect(md).toContain("A school of Mahayana Buddhism");
  });

  it("respects the total budget across all sections", () => {
    const manyEntities: RetrievedBundle = {
      ...BUNDLE,
      entities: Array.from({ length: 100 }, (_, i) => ({
        id: `e${i}`,
        name: `Entity ${i}`,
        type: "person" as const,
        aliases: [],
        facts: [`Fact number ${i} with quite a lot of text to take up space in the context.`],
        sources: ["a.md"],
      })),
    };
    const total =
      DEFAULT_CONTEXT_BUDGET.entities +
      DEFAULT_CONTEXT_BUDGET.concepts +
      DEFAULT_CONTEXT_BUDGET.connections +
      DEFAULT_CONTEXT_BUDGET.sources;
    const md = formatContextMarkdown(manyEntities);
    expect(md.length).toBeLessThanOrEqual(total + 200);
  });
});
