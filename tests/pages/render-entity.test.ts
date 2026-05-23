import { describe, it, expect } from "vitest";
import { renderEntityPage } from "../../src/pages/render-entity.js";
import type { Connection, Entity } from "../../src/core/types.js";

const TODAY = "2026-04-07";

const ENTITY: Entity = {
  id: "alan-watts",
  name: "Alan Watts",
  type: "person",
  aliases: ["A.W. Watts"],
  facts: [
    "Author of The Wisdom of Insecurity",
    "Popularized Zen Buddhism in the West",
  ],
  sources: ["Books/Watts.md", "Learn/Zen.md"],
};

const CONNECTIONS: Connection[] = [
  {
    from: "alan-watts",
    to: "zen-buddhism",
    type: "influences",
    description: "",
    sources: [],
  },
  {
    from: "dt-suzuki",
    to: "alan-watts",
    type: "related-to",
    description: "",
    sources: [],
  },
];

describe("renderEntityPage", () => {
  it("starts with a valid YAML frontmatter block", () => {
    const md = renderEntityPage(ENTITY, [], TODAY);
    expect(md).toMatch(/^---\n/);
    expect(md).toContain("\n---\n");
  });

  it("has a h1 title matching entity name", () => {
    const md = renderEntityPage(ENTITY, [], TODAY);
    expect(md).toContain("\n# Alan Watts\n");
  });

  it("lists all facts under ## Fakten", () => {
    const md = renderEntityPage(ENTITY, [], TODAY);
    expect(md).toContain("## Fakten");
    expect(md).toContain("- Author of The Wisdom of Insecurity");
    expect(md).toContain("- Popularized Zen Buddhism in the West");
  });

  it("lists outgoing connections under ## Verbindungen", () => {
    const md = renderEntityPage(ENTITY, CONNECTIONS, TODAY);
    expect(md).toContain("## Verbindungen");
    expect(md).toContain("[[zen-buddhism]]");
    expect(md).toContain("beeinflusst");
  });

  it("lists incoming connections under ## Verbindungen", () => {
    const incomingConn: Connection = {
      from: "dt-suzuki",
      to: "alan-watts",
      type: "influences",
      description: "",
      sources: [],
    };
    const md = renderEntityPage(ENTITY, [incomingConn], TODAY);
    expect(md).toContain("[[dt-suzuki]]");
  });

  it("lists sources under ## Quellen as wikilinks", () => {
    const md = renderEntityPage(ENTITY, [], TODAY);
    expect(md).toContain("## Quellen");
    expect(md).toContain("[[Books/Watts.md]]");
    expect(md).toContain("[[Learn/Zen.md]]");
  });

  it("omits ## Verbindungen section when there are no connections", () => {
    const md = renderEntityPage(ENTITY, [], TODAY);
    expect(md).not.toContain("## Verbindungen");
  });

  it("omits ## Fakten section when entity has no facts", () => {
    const e = { ...ENTITY, facts: [] };
    const md = renderEntityPage(e, [], TODAY);
    expect(md).not.toContain("## Fakten");
  });

  it("output ends with a newline", () => {
    const md = renderEntityPage(ENTITY, [], TODAY);
    expect(md.endsWith("\n")).toBe(true);
  });

  it("omits ## Quellen section when entity has no sources", () => {
    const e = { ...ENTITY, sources: [] };
    const md = renderEntityPage(e, [], TODAY);
    expect(md).not.toContain("## Quellen");
  });
});
