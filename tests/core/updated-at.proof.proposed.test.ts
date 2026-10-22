/**
 * BEWEIS: `updatedAt` wird im KB tatsaechlich fortgeschrieben.
 *
 * Warum dieser Test existiert:
 * Der erste Test (`frontmatter-dates.proposed.test.ts`) prueft nur die
 * RENDER-Funktion mit einem handgebauten Objekt. Er faellt nicht, wenn
 * das KB-Feld `updatedAt` beim Merge nicht fortgeschrieben wird — der
 * Mutationstest hat genau das gezeigt: `entity.updatedAt = ...` und
 * `concept.updatedAt = ...` aus `mergeEntity`/`mergeConcept` entfernen
 * liess alle Tests gruen.
 *
 * Der Trick: Der Eintrag wird mit einem BEKANNTEN ALTEN `updatedAt`
 * angelegt. Wird beim Merge nichts fortgeschrieben, bleibt der alte Wert
 * stehen und der Test faellt. Ein "created today, merged today"-Vergleich
 * waere blind — er kann einen Merge, der gar nichts tut, nicht erkennen.
 *
 * Dieser Test geht durch das echte KB: `addEntity`/`addConcept` ->
 * Merge -> `entityFrontmatter`. Damit ist die ganze Kette abgedeckt.
 */
import { describe, it, expect } from "vitest";
import { KnowledgeBase } from "../../src/core/kb.js";
import { entityFrontmatter, conceptFrontmatter } from "../../src/pages/frontmatter.js";

const TODAY = new Date().toISOString().slice(0, 10);
const ALT = "2026-01-01";

describe("BEWEIS: updatedAt wird beim Merge fortgeschrieben", () => {
  it("Entity: Merge schreibt updatedAt fort, generatedAt bleibt", () => {
    const kb = new KnowledgeBase();

    // Anlegen mit einem BEKANNTEN ALTEN updatedAt.
    const created = kb.addEntity({
      name: "Alan Watts",
      type: "person",
      facts: ["Alan Watts war ein Autor."],
      generatedAt: ALT,
      updatedAt: ALT,
      source: "Books/Watts.md",
    });
    expect(created.generatedAt).toBe(ALT);
    expect(created.updatedAt).toBe(ALT);

    // Merge ohne eigenes Datum — der Merge muss selbst fortschreiben.
    const merged = kb.addEntity({
      name: "Alan Watts",
      type: "person",
      facts: ["Alan Watts schrieb über Zen."],
      generatedAt: ALT,
      source: "Books/Watts.md",
    });

    // Das Erstellungsdatum bleibt stehen...
    expect(merged.generatedAt).toBe(ALT);
    // ...der Zeitstempel der letzten Pruefung ist heutig.
    expect(merged.updatedAt).toBe(TODAY);

    const fm = entityFrontmatter(merged);
    expect(fm["erstellt"]).toBe(ALT);
    expect(fm["aktualisiert"]).toBe(TODAY);
  });

  it("Concept: Merge schreibt updatedAt fort, generatedAt bleibt", () => {
    const kb = new KnowledgeBase();

    kb.addConcept({
      name: "Zen Buddhism",
      definition: "Eine philosophische Tradition.",
      generatedAt: ALT,
      updatedAt: ALT,
      source: "Books/Watts.md",
    });

    const merged = kb.addConcept({
      name: "Zen Buddhism",
      definition: "Eine philosophische Tradition in Ostasien.",
      generatedAt: ALT,
      source: "Books/Watts.md",
    });

    expect(merged.generatedAt).toBe(ALT);
    expect(merged.updatedAt).toBe(TODAY);

    const fm = conceptFrontmatter(merged);
    expect(fm["erstellt"]).toBe(ALT);
    expect(fm["aktualisiert"]).toBe(TODAY);
  });

  it("Merge in ein bestehendes Konzept schreibt updatedAt ebenfalls fort", () => {
    // Der Pfad addEntity() -> mergeEntityIntoConcept() ist ein eigener Weg.
    // Er muss den Zeitstempel genauso setzen wie der direkte Weg.
    //
    // Wichtig: addEntity() gibt in diesem Fall die EINGEREICHTE Entity
    // zurueck (sie wird bewusst nicht gespeichert). Der Zeitstempel des
    // gespeicherten Konzepts ist deshalb ueber kb.getConcept() zu lesen.
    const kb = new KnowledgeBase();
    kb.addConcept({
      name: "Zen Buddhism",
      definition: "Eine philosophische Tradition.",
      generatedAt: ALT,
      updatedAt: ALT,
      source: "Books/Watts.md",
    });
    kb.addEntity({
      name: "Zen Buddhism",
      type: "other",
      facts: ["Ein Fakt zum Begriff."],
      source: "Books/Watts.md",
    });
    const concept = kb.getConcept("zen-buddhism");
    expect(concept).toBeDefined();
    // Das Erstellungsdatum des Konzepts bleibt unberuehrt...
    expect(concept!.generatedAt).toBe(ALT);
    // ...und der Merge hat den Zeitstempel fortgeschrieben.
    expect(concept!.updatedAt).toBe(TODAY);
  });

  it("updatedAt ist heute, wenn der Eintrag neu angelegt wird", () => {
    const kb = new KnowledgeBase();
    const e = kb.addEntity({
      name: "Test",
      type: "other",
      facts: ["Ein Fakt."],
      source: "a.md",
    });
    expect(e.updatedAt).toBe(TODAY);
  });

  it("Migration einer Entity zum Konzept schreibt updatedAt fort", () => {
    // Eine unklassifizierte "other"-Entity, die spaeter als Konzept
    // wiederkommt, wird migriert. Der Weg ist ein eigener und muss
    // den Zeitstempel ebenfalls setzen.
    const kb = new KnowledgeBase();
    kb.addEntity({
      name: "Amplitude",
      type: "other",
      facts: ["Amplitude ist eine physikalische Groesse."],
      generatedAt: ALT,
      updatedAt: ALT,
      source: "Notizen/Physik.md",
    });
    // Als Konzept eingereicht -> die Entity wird zum Konzept migriert.
    kb.addConcept({
      name: "Amplitude",
      definition: "Amplitude ist eine physikalische Groesse.",
      generatedAt: ALT,
      source: "Notizen/Physik.md",
    });
    const concept = kb.getConcept("amplitude");
    expect(concept).toBeDefined();
    expect(concept!.updatedAt).toBe(TODAY);
    expect(concept!.generatedAt).toBe(ALT);
  });

  it("eine konkrete Entity und ein Konzept koexistieren unveraendert", () => {
    // Spiegelbild: ein KONZEPT trifft auf eine konkrete Entity.
    // Der Kollisionsloeser entscheidet in diesem Fall "create" — beide
    // Eintraege bestehen nebeneinander, es wird also nichts gemergt und
    // folglich auch kein Zeitstempel fortgeschrieben.
    //
    // (Der Zweig mergeConceptIntoEntity() in kb.ts ist fuer diesen Fall
    // unerreichbar — der Resolver liefert nie "merge/entity". Er ist
    // korrekt implementiert und wuerde greifen, falls sich die
    // Entscheidungsregel aendert.)
    const kb = new KnowledgeBase();
    kb.addEntity({
      name: "Obsidian",
      type: "tool",
      facts: ["Obsidian ist ein Markdown-Editor."],
      generatedAt: ALT,
      updatedAt: ALT,
      source: "Notizen/Obsidian.md",
    });
    kb.addConcept({
      name: "Obsidian",
      definition: "Ein Editor.",
      source: "Notizen/Obsidian.md",
    });
    const entity = kb.getEntity("obsidian");
    expect(entity).toBeDefined();
    // Die Entity wurde nicht angefasst — der Zeitstempel steht unveraendert.
    expect(entity!.updatedAt).toBe(ALT);
    expect(entity!.generatedAt).toBe(ALT);
    // Und das Konzept existiert zusaetzlich.
    expect(kb.getConcept("obsidian")).toBeDefined();
  });

  it("der Merge uebernimmt ein uebergebenes Datum", () => {
    // Ein zukuenftiges Datum darf nicht stillschweigend verworfen werden —
    // es wird uebernommen, damit ein gezielter Re-Lauf ein Datum
    // erzwingen kann (z.B. nach einem gezielten Nachtlauf).
    const kb = new KnowledgeBase();
    kb.addEntity({
      name: "Test",
      type: "other",
      facts: ["Ein Fakt."],
      source: "a.md",
    });
    const merged = kb.addEntity({
      name: "Test",
      type: "other",
      facts: ["Noch ein Fakt."],
      updatedAt: "2026-12-24",
      source: "a.md",
    });
    expect(merged.updatedAt).toBe("2026-12-24");
  });
});
