import { describe, it, expect } from "vitest";
import { KnowledgeBase } from "../../src/core/kb.js";
import {
  resolveCrossNamespaceCollision,
  looksLikeConcept,
} from "../../src/core/collision.js";

/**
 * Der Entity-Typ allein ist kein verlaessliches Kriterium: das LLM vergibt
 * "tool" auch fuer fachliche Begriffe ("Amplitude", "Atom"). Die Regel
 * wertet deshalb Typ UND Beschreibung.
 *
 * Kontrollfaelle aus dem Live-Wiki:
 *   amplitude      -> KONZEPT  (Physikbegriff, trotz type=tool)
 *   anemometer     -> Entity   (echtes Messgeraet)
 *   bbc-microbit   -> Entity   (echte Hardware)
 *   accelerometer  -> Entity   (echter Sensor)
 */
describe("looksLikeConcept", () => {
  it("erkennt fachliche Begriffe trotz type=tool", () => {
    expect(
      looksLikeConcept(
        "Wird verwendet, um neue Funktionen zu testen und das Erlebnis dieser Features zu optimieren.",
      ),
    ).toBe(true);
  });

  it("erkennt Begriffe, die als Begriff bezeichnet werden", () => {
    expect(looksLikeConcept("Die Amplitude ist die maximale Auslenkung einer Welle.")).toBe(
      true,
    );
    expect(looksLikeConcept("Ein Fachbegriff, der als Tag im Dokument vorhanden ist.")).toBe(
      true,
    );
  });

  it("erkennt echte Geraete NICHT als Begriff", () => {
    expect(
      looksLikeConcept("Ein Anemometer ist ein Windmessgerät zur Messung der Windgeschwindigkeit."),
    ).toBe(false);
    expect(
      looksLikeConcept("Der BBC micro:bit ist ein kleiner, mikrocontroller-basierter Computer."),
    ).toBe(false);
    expect(
      looksLikeConcept("Misst Bewegung. Bietet Rohdaten für die X-Achse (get_x())."),
    ).toBe(false);
  });
});

describe("resolveCrossNamespaceCollision — Typ UND Beschreibung", () => {
  it("laesst ein echtes Geraet als Entity und ein Konzept coexistieren", () => {
    const d = resolveCrossNamespaceCollision({
      newId: "anemometer",
      newName: "Anemometer",
      newKind: "concept",
      existingKind: "entity",
      existingId: "anemometer",
      existingName: "Anemometer",
      existingType: "tool",
      existingText: "Ein Anemometer ist ein Windmessgerät zur Messung der Windgeschwindigkeit.",
    });
    expect(d.action).toBe("create");
  });

  it("migriert einen fachlichen Begriff mit type=tool zum Konzept", () => {
    const d = resolveCrossNamespaceCollision({
      newId: "amplitude",
      newName: "Amplitude",
      newKind: "concept",
      existingKind: "entity",
      existingId: "amplitude",
      existingName: "Amplitude",
      existingType: "tool",
      existingText:
        "Wird verwendet, um neue Funktionen zu testen und das Erlebnis dieser Features zu optimieren.",
    });
    expect(d.action).toBe("merge");
    expect(d.target).toBe("concept");
  });

  it("migriert eine unklassifizierte other-Entity immer", () => {
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
});

describe("KnowledgeBase — Kollisionsschutz im echten Betrieb", () => {
  it("verschiebt einen fachlichen Begriff mit type=tool ins Konzept", () => {
    const kb = new KnowledgeBase();
    kb.addEntity({
      name: "Amplitude",
      type: "tool",
      facts: [
        "Wird verwendet, um neue Funktionen zu testen und das Erlebnis dieser Features zu optimieren.",
      ],
      source: "Notizen/A.md",
    });
    kb.addConcept({
      name: "Amplitude",
      definition: "Die Amplitude ist die maximale Auslenkung einer Welle von ihrer Ruheposition.",
      source: "Notizen/B.md",
    });

    // Das Konzept gewinnt, die "tool"-Entity wird migriert.
    expect(kb.getEntity("Amplitude")).toBeUndefined();
    const concept = kb.getConcept("Amplitude");
    expect(concept).toBeDefined();
    expect(concept!.definition).toContain("maximale Auslenkung");
    // Die Entity-Fakten und -Quellen sind nicht verloren.
    expect(concept!.definition).toContain("neue Funktionen zu testen");
    expect(concept!.sources).toEqual(
      expect.arrayContaining(["Notizen/A.md", "Notizen/B.md"]),
    );
  });

  it("behaelt ein echtes Geraet als Entity und erzeugt zusaetzlich ein Konzept", () => {
    const kb = new KnowledgeBase();
    kb.addEntity({
      name: "Anemometer",
      type: "tool",
      facts: ["Ein Anemometer ist ein Windmessgerät zur Messung der Windgeschwindigkeit."],
      source: "Notizen/A.md",
    });
    kb.addConcept({
      name: "Anemometer",
      definition: "Ein Anemometer ist das spezifische Messgerät zur Erfassung des Windes.",
      source: "Notizen/B.md",
    });

    expect(kb.getEntity("Anemometer")).toBeDefined();
    expect(kb.getConcept("Anemometer")).toBeDefined();
  });

  it("erzeugt bei wiederholter Extraktion keine Doppelungen", () => {
    const kb = new KnowledgeBase();
    for (let i = 0; i < 4; i++) {
      kb.addConcept({
        name: "Amplitude",
        definition: "Die Amplitude ist die maximale Auslenkung einer Welle.",
        source: `Notizen/${i}.md`,
      });
      kb.addEntity({
        name: "Amplitude",
        type: "tool",
        facts: ["Wird verwendet, um neue Funktionen zu testen."],
        source: `Notizen/${i}.md`,
      });
    }
    const entityIds = kb.allEntities().map((e) => e.id);
    const conceptIds = kb.allConcepts().map((c) => c.id);
    expect(entityIds.filter((id) => conceptIds.includes(id))).toEqual([]);
  });
});
