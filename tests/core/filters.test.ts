import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  isQualityEntity,
  isQualityConcept,
  isFileNameOrPathLike,
} from "../../src/core/filters.js";
import type { Entity, Concept, KBData } from "../../src/core/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(__dirname, "../fixtures/sample-kb.json");
const fixture: KBData = JSON.parse(readFileSync(fixturePath, "utf-8"));

const baseEntity: Entity = {
  id: "alan-watts",
  name: "Alan Watts",
  type: "person",
  aliases: [],
  facts: ["Author of Wisdom of Insecurity", "Master of reversed effort"],
  sources: ["Books/Watts.md", "Learn/Zen.md"],
};

const baseConcept: Concept = {
  id: "zen-buddhism",
  name: "Zen Buddhism",
  definition: "The practice of direct experience",
  related: ["Alan Watts"],
  sources: ["Books/Watts.md"],
};

describe("isQualityEntity", () => {
  it("accepts an entity with enough facts and sources", () => {
    expect(isQualityEntity(baseEntity)).toBe(true);
  });

  it("accepts an entity with exactly 1 fact and 1 source (new threshold)", () => {
    expect(isQualityEntity({ ...baseEntity, facts: ["one fact"], sources: ["one.md"] })).toBe(
      true,
    );
  });

  it("rejects an entity with no facts and no aliases", () => {
    expect(isQualityEntity({ ...baseEntity, facts: [], aliases: [] })).toBe(
      false,
    );
  });

  it("rejects a blacklisted name", () => {
    expect(isQualityEntity({ ...baseEntity, name: "Exact Name" })).toBe(
      false,
    );
    expect(isQualityEntity({ ...baseEntity, name: "unbekannt" })).toBe(
      false,
    );
  });

  it("rejects entities named after filenames or paths", () => {
    expect(isQualityEntity({ ...baseEntity, name: "Passwort-Generator.md" })).toBe(false);
    expect(isQualityEntity({ ...baseEntity, name: "Notizen/Passwort-Generator" })).toBe(false);
  });
});

describe("isQualityConcept", () => {
  it("accepts a concept with a definition and sources", () => {
    expect(isQualityConcept(baseConcept)).toBe(true);
  });

  it("rejects concepts named after filenames or paths", () => {
    expect(isQualityConcept({ ...baseConcept, name: "Whiteboards für den Unterricht.md" })).toBe(false);
    expect(isQualityConcept({ ...baseConcept, name: "Tools/Whiteboards" })).toBe(false);
  });

  it("accepts concepts containing legitimate slashes (years, pairs, acronyms)", () => {
    // User examples from update log:
    expect(
      isQualityConcept({
        ...baseConcept,
        name: "Weiterentwicklung des Schwimmunterrichtspensums ab dem Schuljahr 2027/28",
      }),
    ).toBe(true);
    expect(
      isQualityConcept({
        ...baseConcept,
        name: "KV Cache Memory (Key/Value Cache)",
      }),
    ).toBe(true);
    expect(isQualityConcept({ ...baseConcept, name: "Client/Server-Architektur" })).toBe(true);
    expect(isQualityConcept({ ...baseConcept, name: "Ein-/Ausgabe" })).toBe(true);
  });

  it("rejects a blacklisted name", () => {
    expect(isQualityConcept({ ...baseConcept, name: "Address Book" })).toBe(
      false,
    );
    expect(isQualityConcept({ ...baseConcept, name: "zusammenhang" })).toBe(
      false,
    );
  });

  it("rejects a concept with no definition", () => {
    expect(isQualityConcept({ ...baseConcept, definition: "" })).toBe(false);
  });
});

describe("isFileNameOrPathLike", () => {
  it("detects files with document or note extensions", () => {
    expect(isFileNameOrPathLike("Passwort-Generator.md")).toBe(true);
    expect(isFileNameOrPathLike("Whiteboards für den Unterricht.md")).toBe(true);
    expect(isFileNameOrPathLike("Dokument.pdf")).toBe(true);
    expect(isFileNameOrPathLike("data.json")).toBe(true);
    expect(isFileNameOrPathLike("note.txt")).toBe(true);
  });

  it("detects filesystem and vault paths", () => {
    expect(isFileNameOrPathLike("Notizen/Passwort-Generator")).toBe(true);
    expect(isFileNameOrPathLike("Tools/Whiteboards")).toBe(true);
    expect(isFileNameOrPathLike("Notizen/Computer/KI/OpenRouter Account.md")).toBe(true);
    expect(isFileNameOrPathLike("Notizen/Computer/KI/OpenRouter Account")).toBe(true);
    expect(isFileNameOrPathLike("wiki/sources/Notizen")).toBe(true);
    expect(isFileNameOrPathLike("C:\\Users\\Notes\\Note")).toBe(true);
    expect(isFileNameOrPathLike("./Notizen/Mein-Thema")).toBe(true);
    expect(isFileNameOrPathLike("/etc/nginx")).toBe(true);
    expect(isFileNameOrPathLike("Notizen/")).toBe(true);
  });

  it("does not flag legitimate concepts with slashes as paths", () => {
    // School year / dates / numbers
    expect(
      isFileNameOrPathLike(
        "Weiterentwicklung des Schwimmunterrichtspensums ab dem Schuljahr 2027/28",
      ),
    ).toBe(false);
    expect(isFileNameOrPathLike("Schuljahr 2023/2024")).toBe(false);
    expect(isFileNameOrPathLike("24/7 Service")).toBe(false);
    expect(isFileNameOrPathLike("50/50 Chance")).toBe(false);

    // Parenthetical glosses / alternatives
    expect(isFileNameOrPathLike("KV Cache Memory (Key/Value Cache)")).toBe(false);

    // Word pairings & technical concepts
    expect(isFileNameOrPathLike("Key/Value")).toBe(false);
    expect(isFileNameOrPathLike("Key/Value-Speicher")).toBe(false);
    expect(isFileNameOrPathLike("Client/Server")).toBe(false);
    expect(isFileNameOrPathLike("Client/Server-Architektur")).toBe(false);
    expect(isFileNameOrPathLike("Input/Output")).toBe(false);
    expect(isFileNameOrPathLike("Frontend/Backend")).toBe(false);
    expect(isFileNameOrPathLike("Kosten/Nutzen-Analyse")).toBe(false);

    // Acronyms
    expect(isFileNameOrPathLike("CI/CD")).toBe(false);
    expect(isFileNameOrPathLike("CI/CD Pipeline")).toBe(false);
    expect(isFileNameOrPathLike("TCP/IP")).toBe(false);
    expect(isFileNameOrPathLike("I/O-System")).toBe(false);

    // German hyphenated pairs & gender forms
    expect(isFileNameOrPathLike("Ein-/Ausgabe")).toBe(false);
    expect(isFileNameOrPathLike("Hard-/Software")).toBe(false);
    expect(isFileNameOrPathLike("Mitarbeiter/-innen")).toBe(false);
    expect(isFileNameOrPathLike("Bürger/in")).toBe(false);

    // Units
    expect(isFileNameOrPathLike("Geschwindigkeit in km/h")).toBe(false);

    // Conjunctions
    expect(isFileNameOrPathLike("und/oder")).toBe(false);
    expect(isFileNameOrPathLike("Pro/Contra")).toBe(false);

    // Allowed tools ending with .js
    expect(isFileNameOrPathLike("Node.js")).toBe(false);
    expect(isFileNameOrPathLike("Vue.js")).toBe(false);
  });
});

describe("filters against sample-kb fixture", () => {
  it("accepts the high-quality entities", () => {
    expect(isQualityEntity(fixture.entities["alan-watts"])).toBe(true);
    expect(isQualityEntity(fixture.entities["andrej-karpathy"])).toBe(true);
  });

  it("rejects the noise entities (unless they now pass 1/1 threshold)", () => {
    expect(isQualityEntity(fixture.entities["exact-name"])).toBe(false);
    // lonely-entity in sample-kb has 1 fact and 1 source. 
    // Since we lowered threshold to 1/1, it now PASSES.
    expect(isQualityEntity(fixture.entities["lonely-entity"])).toBe(true);
  });

  it("accepts the high-quality concepts", () => {
    expect(isQualityConcept(fixture.concepts["zen-buddhism"])).toBe(true);
    expect(isQualityConcept(fixture.concepts["law-of-reversed-effort"])).toBe(
      true,
    );
  });

  it("rejects the noise concept", () => {
    expect(isQualityConcept(fixture.concepts["address-book"])).toBe(false);
  });

  it("after filtering, sample-kb yields exactly 3 entities and 2 concepts", () => {
    const goodEntities = Object.values(fixture.entities).filter((e) =>
      isQualityEntity(e),
    );
    const goodConcepts = Object.values(fixture.concepts).filter((c) =>
      isQualityConcept(c),
    );
    // alan-watts (2/2), andrej-karpathy (2/1), lonely-entity (1/1)
    expect(goodEntities).toHaveLength(3);
    expect(goodConcepts).toHaveLength(2);
  });
});
