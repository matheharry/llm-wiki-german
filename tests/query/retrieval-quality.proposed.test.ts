/**
 * BEWEIS: die sechs Verbesserungen der Abfrage.
 *
 * Jeder Test faellt, wenn die zugehoerige Aenderung zurueckgenommen
 * wird. Die Fehlerbilder stammen aus Messungen an der Live-KB
 * (4.900 Entities, 5.577 Konzepte, 5.620 Verbindungen):
 *
 *  1. Kontext-Blase: 408 kB Kontext, davon 16 kB im Prompt. Konzepte,
 *     Verbindungen und alle 659 Quellen fielen kommentarlos weg.
 *  2. Quellen-Explosion: 469 direkt getroffene Records belegten keine
 *     einzige Fundstelle.
 *  3. 1.053 Verbindungen mit reinem Concept-Endpunkt waren unerreichbar.
 *  4. 21 Entities mit Fakten waren unerreichbar (keine Quelle).
 *  5. Die Obergrenzen waren hart codiert.
 *  6. Die Term-Extraktion produzierte Unsinn ("aggregatzustand" ->
 *     "aggregatzu" + "tand").
 */
import { describe, expect, it } from "vitest";

import { KnowledgeBase } from "../../src/core/kb.js";
import { isQualityEntity, isRetrievableEntity } from "../../src/core/filters.js";
import {
  retrieve,
  DEFAULT_RETRIEVAL_LIMITS,
} from "../../src/query/retrieve.js";
import { extractQueryTerms } from "../../src/query/terms.js";
import { formatContextMarkdown } from "../../src/query/format-context.js";
import { buildAskPrompt } from "../../src/query/prompts.js";

function kbWithEntityWithoutSource(): KnowledgeBase {
  const kb = new KnowledgeBase();
  kb.markSource({
    path: "a.md",
    mtime: 1,
    origin: "user-note",
    summary: "Quelle",
  });
  kb.addEntity({
    name: "Mit Quelle",
    type: "person",
    facts: ["Hat einen Beleg."],
    source: "a.md",
  });
  kb.addEntity({
    name: "Ohne Quelle",
    type: "person",
    facts: ["Fakt ohne Beleg.", "Noch ein Fakt."],
    source: "a.md",
  });
  // Quelle entfernen -> die Entity verliert ihre Quelle, behält aber
  // ihr Wissen.
  kb.removeSource("a.md");
  return kb;
}

describe("Punkt 4 — Entity ohne Quelle ist abrufbar", () => {
  it("bleibt im Bundle, obwohl sie keine Wiki-Seite bekommt", () => {
    const kb = kbWithEntityWithoutSource();
    const bundle = retrieve({ question: "Ohne Quelle", kb });
    const names = bundle.entities.map((e) => e.name);
    expect(names).toContain("Ohne Quelle");
  });

  it("trennt Seiten-Erzeugung von Abrufbarkeit", () => {
    const kb = kbWithEntityWithoutSource();
    const e = kb.getEntity("ohne-quelle");
    expect(e).toBeDefined();
    // Keine Seite (kein Beleg) ...
    expect(isQualityEntity(e!)).toBe(false);
    // ... aber antwortrelevant (sie hat Fakten).
    expect(isRetrievableEntity(e!)).toBe(true);
  });

  it("behaelt die Fakten der Entity ohne Quelle", () => {
    const kb = kbWithEntityWithoutSource();
    const bundle = retrieve({ question: "Ohne Quelle", kb });
    const e = bundle.entities.find((x) => x.name === "Ohne Quelle");
    expect(e?.facts).toEqual(["Fakt ohne Beleg.", "Noch ein Fakt."]);
  });

  // Der Exakt-Treffer muss der Qualitaetsanrechnung standhalten: ohne
  // ihn schlug "Meteorologie" (3 Fakten) das gesuchte "Meteor" (1).
  it("holt den exakten Namen vor der reicheren, weniger passenden Entity", () => {
    const kb = new KnowledgeBase();
    kb.addEntity({
      name: "Meteor",
      type: "other",
      facts: ["Ein Gestein aus dem Weltall."],
      source: "a.md",
    });
    kb.addEntity({
      name: "Meteorologie",
      type: "other",
      facts: ["Wetterkunde.", "Lehre von den Atmosphaeren.", "Wettervorhersage."],
      source: "a.md",
    });
    const bundle = retrieve({ question: "Meteor", kb });
    expect(bundle.entities[0]?.name).toBe("Meteor");
  });

  it("holt einen mehrteiligen Namen mit Bindestrich", () => {
    const kb = new KnowledgeBase();
    kb.addEntity({
      name: "KI-Chatbot",
      type: "tool",
      facts: ["Ein Chatbot mit KI."],
      source: "a.md",
    });
    kb.addEntity({
      name: "KI",
      type: "other",
      facts: ["Kuenstliche Intelligenz.", "Ein Feld der Informatik."],
      source: "a.md",
    });
    const bundle = retrieve({ question: "KI-Chatbot", kb });
    expect(bundle.entities.map((e) => e.name)).toContain("KI-Chatbot");
  });

  // Der mehrteilige Name muss VOR dem reicheren Einzelbegriff stehen.
  // Ohne den Vergleich gegen die Gesamtfrage fand der Eintrag nur
  // ueber seine Bestandteile und rutschte hinter "KI" (2 Fakten).
  it("holt einen mehrteiligen Namen vor dem reicheren Einzelbegriff", () => {
    const kb = new KnowledgeBase();
    kb.addEntity({
      name: "KI-Chatbot",
      type: "tool",
      facts: ["Ein Chatbot mit KI."],
      source: "a.md",
    });
    kb.addEntity({
      name: "KI",
      type: "other",
      facts: [
        "Kuenstliche Intelligenz.",
        "Ein Feld der Informatik.",
        "Maschinelles Lernen.",
      ],
      source: "a.md",
    });
    const bundle = retrieve({ question: "KI-Chatbot", kb });
    expect(bundle.entities[0]?.name).toBe("KI-Chatbot");
  });

  it("holt einen mehrteiligen Namen vor dem reicheren Einzelbegriff (mit Stoppwort)", () => {
    const kb = new KnowledgeBase();
    kb.addEntity({
      name: "Bleistift auf Finger",
      type: "other",
      facts: ["Eine Fingerspitze mit Bleistift."],
      source: "a.md",
    });
    kb.addEntity({
      name: "Bleistift",
      type: "other",
      facts: ["Ein Stift.", "Man schreibt damit.", "Aus Holz."],
      source: "a.md",
    });
    const bundle = retrieve({ question: "Bleistift auf Finger", kb });
    expect(bundle.entities[0]?.name).toBe("Bleistift auf Finger");
  });

  // Der Begriff-Vorrang: "Meteor" ist exakt der Name, aber "Meteorologie"
  // hat mehr Fakten. Der Begriff-Vorrang muss den Exakt-Treffer trotzdem
  // nach vorn holen.
  it("gibt dem exakten Begriff den Vorrang vor der reicheren Entity", () => {
    const kb = new KnowledgeBase();
    kb.addEntity({
      name: "Ion",
      type: "other",
      facts: ["Ein geladenes Teilchen."],
      source: "a.md",
    });
    kb.addEntity({
      name: "Ionisation",
      type: "other",
      facts: ["Prozess.", "Entsteht.", "In der Chemie."],
      source: "a.md",
    });
    const bundle = retrieve({ question: "Ion", kb });
    expect(bundle.entities[0]?.name).toBe("Ion");
  });

  // Der Keyword-Bonus: der Konkurrent muss den Suchbegriff ebenfalls
  // im Namen tragen UND mehr Fakten haben. Nur dann entscheidet der
  // Bonus ueber die Position — ohne ihn laege der Konkurrent vorn.
  it("bevorzugt den exakten Namen auch bei aehnlich passendem Konkurrenten", () => {
    const kb = new KnowledgeBase();
    kb.addEntity({
      name: "Ion",
      type: "other",
      facts: ["Ein geladenes Teilchen."],
      source: "a.md",
    });
    kb.addEntity({
      name: "Ionen",
      type: "other",
      facts: ["Teilchen.", "Geladen.", "In der Chemie.", "Der Kern."],
      source: "a.md",
    });
    const bundle = retrieve({ question: "Ion", kb });
    expect(bundle.entities[0]?.name).toBe("Ion");
  });

  // Der Keyword-Bonus muss den Exakt-Treffer ueberhaupt erst in die
  // Auswahl bringen. Mit vielen aehnlich passenden, aber reicheren
  // Konkurrenten rutscht der Exakt-Treffer ohne den Bonus aus den
  // Top 8 heraus.
  it("holt den exakten Namen in die Auswahl, auch bei vielen Konkurrenten", () => {
    const kb = new KnowledgeBase();
    kb.addEntity({
      name: "Device settings",
      type: "other",
      facts: ["Die Konfiguration."],
      source: "a.md",
    });
    // Zehn Konkurrenten, die "device" im Namen tragen und jeweils
    // mehr Fakten haben — sie schlagen den Exakt-Treffer bei der
    // Qualitaetsanrechnung.
    for (let i = 0; i < 10; i++) {
      kb.addEntity({
        name: `Device Konkurrent ${i}`,
        type: "other",
        facts: ["A.", "B.", "C.", "D.", "E."],
        source: "a.md",
      });
    }
    const bundle = retrieve({ question: "Device settings", kb });
    const names = bundle.entities.map((e) => e.name);
    expect(names).toContain("Device settings");
    // Und er muss auch vorn stehen.
    expect(names[0]).toBe("Device settings");
  });

  // Die Normalform muss Bindestriche und Gross-/Kleinschreibung
  // beruecksichtigen: "KI-Chatbot" ist derselbe Name wie "ki chatbot".
  it("erkennt den Namen trotz Bindestrich und anderer Schreibweise", () => {
    const kb = new KnowledgeBase();
    kb.addEntity({
      name: "KI-Chatbot",
      type: "tool",
      facts: ["Ein Chatbot mit KI."],
      source: "a.md",
    });
    kb.addEntity({
      name: "KI",
      type: "other",
      facts: [
        "Kuenstliche Intelligenz.",
        "Ein Feld der Informatik.",
        "Maschinelles Lernen.",
        "Automatische Texterzeugung.",
      ],
      source: "a.md",
    });
    // Kleingeschriebene Frage mit Bindestrich. Ohne die
    // Bindestrich-Normalform waere "ki chatbot" != "ki-chatbot" und
    // der Name nicht mehr exakt.
    const bundle = retrieve({ question: "ki-chatbot", kb });
    expect(bundle.entities[0]?.name).toBe("KI-Chatbot");
  });

  it("holt einen mehrteiligen Namen mit Stoppwort", () => {
    const kb = new KnowledgeBase();
    kb.addEntity({
      name: "Bleistift auf Finger",
      type: "other",
      facts: ["Eine Fingerspitze mit Bleistift."],
      source: "a.md",
    });
    const bundle = retrieve({ question: "Bleistift auf Finger", kb });
    expect(bundle.entities.map((e) => e.name)).toContain("Bleistift auf Finger");
  });
});

describe("Punkt 3 — Verbindungen mit Concept-Endpunkt", () => {
  it("holt eine Verbindung, deren Ende nur ein Concept ist", () => {
    const kb = new KnowledgeBase();
    kb.addConcept({
      name: "Bildungsprozess",
      definition: "Didaktischer Prozess.",
      related: [],
      source: "a.md",
    });
    kb.addConcept({
      name: "Künstliche Intelligenz",
      definition: "Verfahren.",
      related: [],
      source: "a.md",
    });
    kb.addConnection({
      from: "künstliche-intelligenz",
      to: "bildungsprozess",
      type: "influences",
      description: "KI veraendert den Bildungsprozess.",
      source: "a.md",
    });

    const bundle = retrieve({ question: "Bildungsprozess", kb });
    const types = bundle.connections.map((c) => c.type);
    expect(types).toContain("influences");
  });

  it("holt eine Verbindung, deren Ende nur eine Entity ist", () => {
    const kb = new KnowledgeBase();
    kb.addEntity({
      name: "Harald March",
      type: "person",
      facts: ["Lehrer."],
      source: "a.md",
    });
    kb.addConcept({
      name: "Unterricht",
      definition: "Lehrsituation.",
      related: [],
      source: "a.md",
    });
    kb.addConnection({
      from: "harald-march",
      to: "unterricht",
      type: "related-to",
      description: "Unterricht.",
      source: "a.md",
    });
    const bundle = retrieve({ question: "Harald March", kb });
    expect(bundle.connections.map((c) => c.type)).toContain("related-to");
  });
});

describe("Punkt 1a — Quellenliste ist begrenzt", () => {
  it("haelt die Quellen der Fundstellen zuerst", () => {
    const kb = new KnowledgeBase();
    kb.addEntity({
      name: "ChatGPT",
      type: "tool",
      facts: ["Sprachmodell."],
      source: "a.md",
    });
    kb.markSource({ path: "a.md", mtime: 1, origin: "user-note", summary: "A" });
    kb.markSource({
      path: "direkt.md",
      mtime: 1,
      origin: "user-note",
      summary: "ChatGPT ist ein Sprachmodell.",
    });

    const bundle = retrieve({ question: "ChatGPT", kb });
    // Die Fundstelle "a.md" muss vor der direkt getroffenen Quelle
    // "direkt.md" stehen.
    const ids = bundle.sources.map((s) => s.id);
    expect(ids.indexOf("a.md")).toBeLessThan(ids.indexOf("direkt.md"));
  });

  it("beschraenkt die Quellenzahl", () => {
    const kb = new KnowledgeBase();
    kb.addEntity({
      name: "Hubert",
      type: "person",
      facts: ["Fakt."],
      source: "a.md",
    });
    for (let i = 0; i < 50; i++) {
      kb.markSource({
        path: `s${i}.md`,
        mtime: 1,
        origin: "user-note",
        summary: `Hubert Faktor ${i}`,
      });
    }
    const bundle = retrieve({
      question: "Hubert",
      kb,
      limits: { maxSources: 10 },
    });
    expect(bundle.sources.length).toBeLessThanOrEqual(10);
  });

  it("haelt ohne Limit alle Quellen der Fundstellen", () => {
    const kb = new KnowledgeBase();
    kb.addEntity({
      name: "Hubert",
      type: "person",
      facts: ["Fakt."],
      source: "a.md",
    });
    // `addEntity` legt keinen Source-Record an — das macht `markSource`.
    kb.markSource({ path: "a.md", mtime: 1, origin: "user-note", summary: "Quelle" });
    for (let i = 0; i < 5; i++) {
      kb.markSource({
        path: `s${i}.md`,
        mtime: 1,
        origin: "user-note",
        summary: `Hubert Faktor ${i}`,
      });
    }
    const bundle = retrieve({ question: "Hubert", kb });
    // 1 Fundstelle (a.md) + 5 direkt getroffene Records.
    expect(bundle.sources.length).toBe(6);
  });
});

describe("Punkt 5 — Obergrenzen sind konfigurierbar", () => {
  it("respektiert maxEntities", () => {
    const kb = new KnowledgeBase();
    for (let i = 0; i < 20; i++) {
      kb.addEntity({
        name: `Werkzeug ${i}`,
        type: "tool",
        facts: [`Fakt ${i}.`],
        source: "a.md",
      });
    }
    const bundle = retrieve({
      question: "Werkzeug",
      kb,
      limits: { maxEntities: 3 },
    });
    expect(bundle.entities.length).toBeLessThanOrEqual(3);
  });

  it("respektiert maxConcepts", () => {
    const kb = new KnowledgeBase();
    for (let i = 0; i < 20; i++) {
      kb.addConcept({
        name: `Begriff ${i}`,
        definition: `Definition ${i}.`,
        related: [],
        source: "a.md",
      });
    }
    const bundle = retrieve({
      question: "Begriff",
      kb,
      limits: { maxConcepts: 2 },
    });
    expect(bundle.concepts.length).toBeLessThanOrEqual(2);
  });

  it("respektiert maxConnections", () => {
    const kb = new KnowledgeBase();
    kb.addEntity({
      name: "Anker",
      type: "person",
      facts: ["Fakt."],
      source: "a.md",
    });
    for (let i = 0; i < 20; i++) {
      kb.addEntity({
        name: `Ziel ${i}`,
        type: "other",
        facts: [`Fakt ${i}.`],
        source: "a.md",
      });
      kb.addConnection({
        from: "anker",
        to: `ziel-${i}`,
        type: "related-to",
        description: `Verbindung ${i}.`,
        source: "a.md",
      });
    }
    const bundle = retrieve({
      question: "Anker",
      kb,
      limits: { maxConnections: 4 },
    });
    expect(bundle.connections.length).toBeLessThanOrEqual(4);
  });

  it("0 schaltet eine Kategorie ab", () => {
    const kb = new KnowledgeBase();
    kb.addEntity({
      name: "Anker",
      type: "person",
      facts: ["Fakt."],
      source: "a.md",
    });
    kb.addConcept({
      name: "Begriff",
      definition: "Def.",
      related: [],
      source: "a.md",
    });
    const bundle = retrieve({
      question: "Anker Begriff",
      kb,
      limits: { maxConcepts: 0 },
    });
    expect(bundle.concepts.length).toBe(0);
  });

  it("hat sinnvolle Standardwerte", () => {
    expect(DEFAULT_RETRIEVAL_LIMITS.maxEntities).toBe(8);
    expect(DEFAULT_RETRIEVAL_LIMITS.maxConcepts).toBe(5);
    expect(DEFAULT_RETRIEVAL_LIMITS.maxConnections).toBe(20);
    // Vorher gab es keine Quellengrenze.
    expect(DEFAULT_RETRIEVAL_LIMITS.maxSources).toBeGreaterThan(0);
  });
});

describe("Punkt 6 — Term-Extraktion erzeugt keine Unsinns-Fragmente", () => {
  it("zerlegt 'aggregatzustand' nicht in Muell", () => {
    const terms = extractQueryTerms("Was ist Aggregatzustand?");
    expect(terms).not.toContain("aggregatzu");
    expect(terms).not.toContain("tand");
    expect(terms).toContain("aggregatzustand");
  });

  it("zerlegt ein echtes Fugen-s-Kompositum weiterhin", () => {
    const terms = extractQueryTerms("Wissensbasis");
    expect(terms).toContain("wissen");
    expect(terms).toContain("basis");
  });

  it("erzeugt fuer gewoehnliche lange Woerter keine Fragmente", () => {
    for (const w of [
      "Reflexion",
      "Physikalische",
      "Aggregatzustand",
      "Unterrichtsmaterial",
    ]) {
      const terms = extractQueryTerms(w);
      // Kein Fragment darf laenger sein als 3 Zeichen UND kuerzer
      // als das halbe Wort sein.
      for (const t of terms) {
        if (t === w) continue;
        expect(t.length).toBeGreaterThan(3);
      }
    }
  });

  it("behaelt die Stoppwort-Filterung", () => {
    const terms = extractQueryTerms("Was ist der Aggregatzustand der Materie?");
    expect(terms).not.toContain("der");
    expect(terms).not.toContain("ist");
    expect(terms).toContain("aggregatzustand");
  });
});

describe("Punkt 1b + 2 — Kontext zeigt Namen und bleibt im Budget", () => {
  it("zeigt `related` als lesbaren Namen", () => {
    const kb = new KnowledgeBase();
    kb.addConcept({
      name: "Standards",
      definition: "Regeln.",
      related: ["Schulmaterial"],
      source: "a.md",
    });
    // Das Ziel muss existieren, damit der Verweis aufgeloest wird.
    kb.addConcept({
      name: "Schulmaterial",
      definition: "Material fuer den Unterricht.",
      related: [],
      source: "a.md",
    });
    kb.resolveAllRelated();
    // Nach der Aufloesung steht die ID im Feld, nicht mehr der Name.
    expect(kb.getConcept("standards")?.related).toEqual(["schulmaterial"]);

    const bundle = retrieve({
      question: "Standards",
      kb,
      nameById: kb.nameMap(),
    });
    const md = formatContextMarkdown(bundle);
    expect(md).toContain("Verwandt mit: Schulmaterial");
    // Der Slug darf nicht mehr erscheinen.
    expect(md).not.toContain("Verwandt mit: schulmaterial");
  });

  it("zeigt `related` ohne Namensmappe als ID (Fallback)", () => {
    const kb = new KnowledgeBase();
    kb.addConcept({
      name: "Standards",
      definition: "Regeln.",
      related: ["Schulmaterial"],
      source: "a.md",
    });
    kb.addConcept({
      name: "Schulmaterial",
      definition: "Material.",
      related: [],
      source: "a.md",
    });
    kb.resolveAllRelated();
    const bundle = retrieve({ question: "Standards", kb });
    const md = formatContextMarkdown(bundle);
    expect(md).toContain("Verwandt mit: schulmaterial");
  });

  it("zeigt Verbindungs-Endpunkte als lesbare Namen", () => {
    const kb = new KnowledgeBase();
    kb.addEntity({
      name: "Harald March",
      type: "person",
      facts: ["Lehrer."],
      source: "a.md",
    });
    kb.addConcept({
      name: "Unterricht",
      definition: "Lehrsituation.",
      related: [],
      source: "a.md",
    });
    kb.addConnection({
      from: "harald-march",
      to: "unterricht",
      type: "related-to",
      description: "Unterricht.",
      source: "a.md",
    });
    const bundle = retrieve({
      question: "Harald March",
      kb,
      nameById: kb.nameMap(),
    });
    const md = formatContextMarkdown(bundle);
    expect(md).toContain("Harald March → Unterricht (related-to)");
    // Die Slugs duerfen nicht mehr dastehen.
    expect(md).not.toContain("harald-march →");
    expect(md).not.toContain("→ unterricht");
  });

  it("kürzt die Quellenpfade auf den Dateinamen", () => {
    const kb = new KnowledgeBase();
    kb.addEntity({
      name: "Hubert",
      type: "person",
      facts: ["Fakt."],
      source: "Notizen/Schule/Mathe/Klasse 6/Bruchrechnung.md",
    });
    kb.markSource({
      path: "Notizen/Schule/Mathe/Klasse 6/Bruchrechnung.md",
      mtime: 1,
      origin: "user-note",
      summary: "Quelle",
    });
    const bundle = retrieve({
      question: "Hubert",
      kb,
      nameById: kb.nameMap(),
    });
    const md = formatContextMarkdown(bundle);
    // Nur der Dateiname — der Pfad war der groesste Ballast.
    expect(md).toContain("Quellen: Bruchrechnung.md");
    expect(md).not.toContain("Quellen: Notizen/Schule/Mathe/Klasse 6/Bruchrechnung.md");
  });

  it("haelt alle Abschnitte im Prompt, wenn der Kontext passt", () => {
    const kb = new KnowledgeBase();
    kb.addEntity({
      name: "ChatGPT",
      type: "tool",
      facts: ["Sprachmodell."],
      source: "a.md",
    });
    kb.addConcept({
      name: "KI",
      definition: "Künstliche Intelligenz.",
      related: [],
      source: "a.md",
    });
    kb.markSource({ path: "a.md", mtime: 1, origin: "user-note", summary: "Quelle" });

    const bundle = retrieve({
      question: "ChatGPT KI",
      kb,
      nameById: kb.nameMap(),
    });
    const prompt = buildAskPrompt({
      question: "ChatGPT KI",
      context: formatContextMarkdown(bundle),
    });
    expect(prompt.user).toContain("## ENTITÄTEN");
    expect(prompt.user).toContain("## KONZEPTE");
    expect(prompt.user).toContain("## QUELLDATEIEN");
  });

  it("kürzt nicht blind am Ende, sondern pro Abschnitt", () => {
    const kb = new KnowledgeBase();
    // Eine Entity mit sehr vielen Fakten frischt das Budget.
    kb.addEntity({
      name: "VielFakt",
      type: "other",
      facts: Array.from({ length: 50 }, (_, i) => `Fakt Nummer ${i} mit Text.`),
      source: "a.md",
    });
    kb.addConcept({
      name: "Konzept",
      definition: "Eine Definition.",
      related: [],
      source: "a.md",
    });
    kb.markSource({ path: "a.md", mtime: 1, origin: "user-note", summary: "Quelle" });

    const bundle = retrieve({
      question: "VielFakt Konzept",
      kb,
      nameById: kb.nameMap(),
    });
    const prompt = buildAskPrompt({
      question: "VielFakt Konzept",
      context: formatContextMarkdown(bundle),
    });
    // Das Konzept muss noch da sein, obwohl die Entity das Budget
    // fressen wollte.
    expect(prompt.user).toContain("Eine Definition.");
  });

  it("vermerkt die Kürzung im Abschnitt", () => {
    const kb = new KnowledgeBase();
    kb.addEntity({
      name: "VielFakt",
      type: "other",
      facts: Array.from({ length: 50 }, (_, i) => `Fakt Nummer ${i} mit Text.`),
      source: "a.md",
    });
    const bundle = retrieve({
      question: "VielFakt",
      kb,
      nameById: kb.nameMap(),
    });
    const md = formatContextMarkdown(bundle, {
      entities: 300,
      concepts: 4_000,
      connections: 2_000,
      sources: 4_000,
    });
    // Punkt 2: Die Kürzung wird markiert, damit das LLM weiss, dass
    // die Liste unvollstaendig ist.
    expect(md).toContain("gekürzt");
  });
});
