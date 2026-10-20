import { describe, it, expect } from "vitest";
import { KnowledgeBase } from "../../src/core/kb.js";
import {
  resolveCrossNamespaceCollision,
  isSameTerm,
  normalizeForCompare,
} from "../../src/core/collision.js";

/**
 * Verhindert doppelte Namen zwischen Entity- und Konzept-Namespace.
 *
 * Hintergrund: addEntity() und addConcept() arbeiten in getrennten
 * Namespaces ohne gegenseitige Pruefung. Beide nutzen makeId(name), also
 * erzeugte derselbe Name in beiden Namespaces dieselbe ID. Im Live-Wiki
 * existierten 576 solche Kollisionen — 2.452 Verbindungs-Endpunkte waren
 * dadurch mehrdeutig.
 */
describe("normalizeForCompare / isSameTerm", () => {
  it("ignoriert Anfuehrungszeichen", () => {
    expect(normalizeForCompare('"3D-Spiele programmieren mit Unity"')).toBe(
      normalizeForCompare("3D-Spiele programmieren mit Unity"),
    );
  });

  it("ignoriert eckige Klammern", () => {
    expect(normalizeForCompare("[Spektrale Zusammensetzung von Licht]")).toBe(
      normalizeForCompare("Spektrale Zusammensetzung von Licht"),
    );
  });

  it("ignoriert runde Klammern", () => {
    expect(isSameTerm("Definitionsmenge (D)", "Definitionsmenge D")).toBe(true);
  });

  it("unterscheidet echte verschiedene Begriffe", () => {
    expect(isSameTerm("Definitionsmenge D", "Definitionsmenge E")).toBe(false);
  });
});

describe("resolveCrossNamespaceCollision", () => {
  it("laesst eine klassifizierte Entity und ein Konzept koexistieren", () => {
    const d = resolveCrossNamespaceCollision({
      newId: "tasmota",
      newName: "Tasmota",
      newKind: "entity",
      newType: "tool",
      existingKind: "concept",
      existingId: "tasmota",
      existingName: "Tasmota",
    });
    expect(d.action).toBe("create");
  });

  it("zieht die unklassifizierte 'other'-Entity dem Konzept vor", () => {
    const d = resolveCrossNamespaceCollision({
      newId: "abfrage",
      newName: "Abfrage",
      newKind: "entity",
      newType: "other",
      existingKind: "concept",
      existingId: "abfrage",
      existingName: "Abfrage",
    });
    expect(d.action).toBe("merge");
    expect(d.target).toBe("concept");
  });

  it("laesst eine klassifizierte Entity und ein Konzept koexistieren", () => {
    const d = resolveCrossNamespaceCollision({
      newId: "tasmota",
      newName: "Tasmota",
      newKind: "concept",
      existingKind: "entity",
      existingId: "tasmota",
      existingName: "Tasmota",
      existingType: "tool",
    });
    expect(d.action).toBe("create");
    expect(d.target).toBe("concept");
  });

  it("treatet Formatvarianten als denselben Begriff", () => {
    const d = resolveCrossNamespaceCollision({
      newId: "definitionsmenge-d",
      newName: "Definitionsmenge (D)",
      newKind: "entity",
      newType: "other",
      existingKind: "concept",
      existingId: "definitionsmenge-d",
      existingName: "Definitionsmenge D",
    });
    expect(d.action).toBe("merge");
  });

  it("ignoriert verschiedene Begriffe mit gleichem Slug", () => {
    const d = resolveCrossNamespaceCollision({
      newId: "c",
      newName: "C Sharp",
      newKind: "entity",
      newType: "tool",
      existingKind: "concept",
      existingId: "c",
      existingName: "C++",
    });
    expect(d.action).toBe("create");
  });
});

describe("KnowledgeBase — Namespace-Kollision", () => {
  it("legt keine Entity an, wenn das Konzept schon existiert", () => {
    const kb = new KnowledgeBase();
    kb.addConcept({
      name: "3D-Druck",
      definition: "Der Prozess, bei dem ein digitaler Entwurf schichtweise gebaut wird.",
      source: "Notizen/A.md",
    });

    kb.addEntity({
      name: "3D-Druck",
      type: "other",
      facts: ["Ein 3D-Drucker baut schichtweise."],
      source: "Notizen/B.md",
    });

    // Keine Entity angelegt
    expect(kb.getEntity("3D-Druck")).toBeUndefined();
    // Konzept existiert weiterhin und hat die Quelle bekommen
    const concept = kb.getConcept("3D-Druck");
    expect(concept).toBeDefined();
    expect(concept!.sources).toContain("Notizen/A.md");
    expect(concept!.sources).toContain("Notizen/B.md");
  });

  it("haelt eine klassifizierte Entity und ein Konzept getrennt", () => {
    const kb = new KnowledgeBase();
    kb.addEntity({
      name: "Tasmota",
      type: "tool",
      facts: ["Firmware für Esphome."],
      source: "Notizen/A.md",
    });
    kb.addConcept({
      name: "Tasmota",
      definition: "Ein Firmware-Projekt für Smart-Home-Geräte.",
      source: "Notizen/B.md",
    });

    expect(kb.getEntity("Tasmota")).toBeDefined();
    expect(kb.getConcept("Tasmota")).toBeDefined();
  });

  it("migriert eine unklassifizierte Entity in das Konzept", () => {
    const kb = new KnowledgeBase();
    kb.addEntity({
      name: "Tasmota",
      type: "other",
      facts: ["Firmware für Esphome."],
      source: "Notizen/A.md",
    });

    kb.addConcept({
      name: "Tasmota",
      definition: "Ein Firmware-Projekt für Smart-Home-Geräte.",
      source: "Notizen/B.md",
    });

    // Das Konzept hat Vorrang: es existiert, die "other"-Entity ist gewichen.
    const concept = kb.getConcept("Tasmota");
    expect(concept).toBeDefined();
    expect(concept!.definition).toContain("Ein Firmware-Projekt für Smart-Home-Geräte.");
    // Die Entity-Fakten und -Quellen sind übernommen.
    expect(concept!.definition).toContain("Firmware für Esphome.");
    expect(concept!.sources).toEqual(
      expect.arrayContaining(["Notizen/A.md", "Notizen/B.md"]),
    );
    // Die Entity existiert nicht mehr.
    expect(kb.getEntity("Tasmota")).toBeUndefined();
  });

  it("verbindet Quellen beider Seiten, wenn ein Begriff kollidiert", () => {
    const kb = new KnowledgeBase();
    kb.addConcept({
      name: "Abfrage",
      definition: "Eine SQL-Anweisung zum Abrufen von Daten.",
      source: "Notizen/A.md",
    });
    kb.addEntity({
      name: "Abfrage",
      type: "other",
      facts: ["Access-Abfrage"],
      source: "Notizen/B.md",
    });
    const concept = kb.getConcept("Abfrage");
    expect(concept!.sources).toEqual(
      expect.arrayContaining(["Notizen/A.md", "Notizen/B.md"]),
    );
  });

  it("legt bei jedem Lauf nur einen Namespace an (Idempotenz)", () => {
    const kb = new KnowledgeBase();
    for (let i = 0; i < 3; i++) {
      kb.addConcept({
        name: "Klima",
        definition: "Das langfristige Wetterregime.",
        source: `Notizen/${i}.md`,
      });
      kb.addEntity({
        name: "Klima",
        type: "other",
        facts: ["Wetter und Klima unterscheiden sich."],
        source: `Notizen/${i}.md`,
      });
    }
    const entityIds = kb.allEntities().map((e) => e.id);
    const conceptIds = kb.allConcepts().map((c) => c.id);
    const overlap = entityIds.filter((id) => conceptIds.includes(id));
    expect(overlap).toEqual([]);
  });
});
