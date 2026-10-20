import { describe, it, expect } from "vitest";
import {
  filterConnectionLinks,
  filterConnections,
} from "../../src/core/connection-filter.js";
import type { Connection } from "../../src/core/types.js";

/**
 * Verbindungen wurden ohne Prüfung angelegt, ob es für das Ziel (und die
 * Quelle) eine Seite gibt. Im Live-Wiki zeigten 760 der 10.232 gerenderten
 * Verbindungs-Links auf nicht existierende Seiten.
 */
const CONN = (from: string, to: string, type = "related-to"): Connection => ({
  from,
  to,
  type: type as Connection["type"],
  description: "",
  sources: [],
});

describe("filterConnectionLinks", () => {
  it("behaelt Links, deren Ziel existiert", () => {
    const connections = [CONN("a", "b")];
    const { links, deadLinks } = filterConnectionLinks(
      connections,
      "a",
      (id) => id === "a" || id === "b",
    );
    expect(links).toHaveLength(1);
    expect(links[0].target).toBe("b");
    expect(links[0].direction).toBe("outgoing");
    expect(deadLinks).toHaveLength(0);
  });

  it("trennt Links ohne Ziel ab", () => {
    const connections = [CONN("a", "fehlt")];
    const { links, deadLinks } = filterConnectionLinks(
      connections,
      "a",
      (id) => id === "a",
    );
    expect(links).toHaveLength(0);
    expect(deadLinks).toHaveLength(1);
    expect(deadLinks[0].target).toBe("fehlt");
  });

  it("filtert PRO LINK-ENDE, nicht pro Verbindung", () => {
    // Die Verbindung X -> Y hat nur auf der X-Seite einen toten Link.
    // Auf der Y-Seite ist der Link auf X völlig gueltig.
    const connections = [CONN("x", "y")];

    // X existiert, Y nicht: auf der X-Seite ist der Link zu Y tot.
    const fromX = filterConnectionLinks(connections, "x", (id) => id === "x");
    expect(fromX.links).toHaveLength(0);
    expect(fromX.deadLinks).toHaveLength(1);

    // Y existiert, X nicht: auf der Y-Seite ist der Link zu X ebenfalls tot —
    // aber es ist ein eigener Link, nicht derselbe.
    const fromY = filterConnectionLinks(connections, "y", (id) => id === "y");
    expect(fromY.links).toHaveLength(0);
    expect(fromY.deadLinks).toHaveLength(1);
    expect(fromY.deadLinks[0].target).toBe("x");
    expect(fromY.deadLinks[0].direction).toBe("incoming");

    // Beide existieren: auf beiden Seiten ein lebender Link.
    const both = filterConnectionLinks(connections, "y", () => true);
    expect(both.links).toHaveLength(1);
    expect(both.links[0].target).toBe("x");
    expect(both.links[0].direction).toBe("incoming");
    expect(both.deadLinks).toHaveLength(0);
  });

  it("ignoriert Verbindungen, die die Seite nicht betreffen", () => {
    const connections = [CONN("x", "y")];
    const { links, deadLinks } = filterConnectionLinks(
      connections,
      "z",
      () => true,
    );
    expect(links).toHaveLength(0);
    expect(deadLinks).toHaveLength(0);
  });

  it("behandelt Selbstbezuege korrekt", () => {
    const connections = [CONN("a", "a")];
    const { links } = filterConnectionLinks(connections, "a", () => true);
    // Der ausgehende Zweig greift zuerst — kein doppelter Link.
    expect(links).toHaveLength(1);
    expect(links[0].direction).toBe("outgoing");
  });

  it("behaelt den Verbindungstyp fuer die Beschriftung", () => {
    const connections = [CONN("a", "b", "influences")];
    const { links } = filterConnectionLinks(connections, "a", () => true);
    expect(links[0].type).toBe("influences");
  });
});

describe("filterConnections", () => {
  it("behaelt Verbindungen mit existierendem Ziel", () => {
    const connections = [CONN("a", "b"), CONN("a", "c")];
    const { kept, dropped } = filterConnections(connections, (id) => id === "b");
    expect(kept).toHaveLength(1);
    expect(kept[0].to).toBe("b");
    expect(dropped).toHaveLength(1);
    expect(dropped[0].to).toBe("c");
  });
});
