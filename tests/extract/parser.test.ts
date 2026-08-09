import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseExtraction } from "../../src/extract/parser.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixDir = join(here, "..", "fixtures", "raw-llm-responses");
const fx = (name: string): string => readFileSync(join(fixDir, name), "utf8");

describe("parseExtraction — happy path", () => {
  it("parses clean JSON into the expected shape", () => {
    const parsed = parseExtraction(fx("happy.txt"));
    expect(parsed).not.toBeNull();
    expect(parsed!.source_summary).toMatch(/Alan Watts/);
    expect(parsed!.entities).toHaveLength(1);
    expect(parsed!.entities[0].name).toBe("Alan Watts");
    expect(parsed!.entities[0].type).toBe("person");
    expect(parsed!.concepts).toHaveLength(1);
    expect(parsed!.concepts[0].name).toBe("Zen");
    expect(parsed!.connections).toHaveLength(1);
  });

  it("returns default empty arrays if the model omits a field", () => {
    const parsed = parseExtraction('{"source_summary": "only a summary"}');
    expect(parsed).not.toBeNull();
    expect(parsed!.entities).toEqual([]);
    expect(parsed!.concepts).toEqual([]);
    expect(parsed!.connections).toEqual([]);
  });
});

describe("parseExtraction — 7B model quirks", () => {
  it("strips markdown ```json fences", () => {
    const parsed = parseExtraction(fx("markdown-fenced.txt"));
    expect(parsed).not.toBeNull();
    expect(parsed!.entities[0].name).toBe("X");
  });

  it("forgives trailing commas inside arrays and objects", () => {
    const parsed = parseExtraction(fx("trailing-commas.txt"));
    expect(parsed).not.toBeNull();
    expect(parsed!.entities).toHaveLength(1);
    expect(parsed!.entities[0].name).toBe("Foo");
  });

  it("extracts the outermost object from preamble/postamble noise", () => {
    const parsed = parseExtraction(fx("preamble-postamble.txt"));
    expect(parsed).not.toBeNull();
    expect(parsed!.entities[0].name).toBe("Bar");
  });

  it("filters out null or invalid elements in arrays", () => {
    const parsed = parseExtraction(
      JSON.stringify({
        source_summary: "summary",
        entities: [null, { name: "Valid Entity", type: "person" }, "invalid string"],
        concepts: [undefined, { name: "Valid Concept", definition: "def" }, 42],
        connections: [null, { from: "A", to: "B", type: "uses" }]
      })
    );
    expect(parsed).not.toBeNull();
    expect(parsed!.entities).toHaveLength(1);
    expect(parsed!.entities[0].name).toBe("Valid Entity");
    expect(parsed!.concepts).toHaveLength(1);
    expect(parsed!.concepts[0].name).toBe("Valid Concept");
    expect(parsed!.connections).toHaveLength(1);
    expect(parsed!.connections[0].from).toBe("A");
  });
});

describe("parseExtraction — failure modes", () => {
  it("returns null on empty input", () => {
    expect(parseExtraction("")).toBeNull();
    expect(parseExtraction("   \n  ")).toBeNull();
    expect(parseExtraction(fx("empty.txt"))).toBeNull();
  });

  it("returns null when no JSON object is present", () => {
    expect(parseExtraction(fx("no-braces.txt"))).toBeNull();
  });

  it("returns null on unparseable JSON even after cleanup", () => {
    expect(parseExtraction("{ this: is not: json }")).toBeNull();
  });

  it("returns null when the top-level value is not an object", () => {
    expect(parseExtraction("[1,2,3]")).toBeNull();
  });
});

describe("parseExtraction — robust JSON repair", () => {
  it("repairs unescaped raw newlines and tabs inside strings", () => {
    const raw = `{\n  "source_summary": "First line\nsecond line with\ttab",\n  "entities": []\n}`;
    const parsed = parseExtraction(raw);
    expect(parsed).not.toBeNull();
    expect(parsed!.source_summary).toContain("First line");
    expect(parsed!.source_summary).toContain("second line");
  });

  it("repairs unescaped quotes inside code snippets", () => {
    const raw = `{\n  "source_summary": "Uses <script src="https://cdn.com"></script> for styling",\n  "entities": []\n}`;
    const parsed = parseExtraction(raw);
    expect(parsed).not.toBeNull();
    expect(parsed!.source_summary).toContain("cdn.com");
  });

  it("fixes invalid backslash escape sequences", () => {
    const raw = `{\n  "source_summary": "Pfad C:\\Users\\Name\\notizen",\n  "entities": []\n}`;
    const parsed = parseExtraction(raw);
    expect(parsed).not.toBeNull();
    expect(parsed!.source_summary).toContain("Users");
  });

  it("strips JS comments and smart quotes", () => {
    const raw = `// Comment line\n{\n  “source_summary”: “Zusammenfassung mit /* comment */ Text”\n}`;
    const parsed = parseExtraction(raw);
    expect(parsed).not.toBeNull();
    expect(parsed!.source_summary).toContain("Zusammenfassung");
  });

  it("auto-closes truncated JSON missing closing brackets", () => {
    const raw = `{\n  "source_summary": "Abgebrochen",\n  "entities": [{"name": "Teilweise"`;
    const parsed = parseExtraction(raw);
    expect(parsed).not.toBeNull();
    expect(parsed!.entities[0].name).toBe("Teilweise");
  });
});

