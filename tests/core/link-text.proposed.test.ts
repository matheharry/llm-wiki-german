import { describe, it, expect } from "vitest";
import {
  unwrapWikilink,
  escapeLinkLabel,
  toLinkLabel,
} from "../../src/core/link-text.js";

/**
 * Das LLM liefert gelegentlich einen Namen, der bereits wie ein Wikilink
 * formatiert ist — im Live-Wiki stand als Entity-Name wörtlich
 * "[[Breezedeus]]". Als Linktext verwendet, entsteht
 * "[[breezedeus|[[Breezedeus]]]]" — ein kaputter Link.
 */
describe("unwrapWikilink", () => {
  it("entfernt eine vorhandene Wikilink-Verpackung", () => {
    expect(unwrapWikilink("[[Breezedeus]]")).toBe("Breezedeus");
  });

  it("behaelt den Anzeigenamen, wenn einer vorhanden ist", () => {
    expect(unwrapWikilink("[[ziel|Anzeige]]")).toBe("Anzeige");
  });

  it("laesst normale Namen unveraendert", () => {
    expect(unwrapWikilink("Markdown")).toBe("Markdown");
  });

  it("erkennt keine teilweise Verpackung", () => {
    expect(unwrapWikilink("Text [[Link]] mehr")).toBe("Text [[Link]] mehr");
  });
});

describe("escapeLinkLabel", () => {
  it("maskiert senkrechte Striche", () => {
    expect(escapeLinkLabel("Lösung (x|y)")).toBe("Lösung (x\\|y)");
  });

  it("laesst normale Namen unveraendert", () => {
    expect(escapeLinkLabel("Markdown")).toBe("Markdown");
  });
});

describe("toLinkLabel", () => {
  it("kombiniert beide Schritte", () => {
    expect(toLinkLabel("[[Breezedeus]]")).toBe("Breezedeus");
    expect(toLinkLabel("[[x|Lösung (a|b)]]")).toBe("Lösung (a\\|b)");
  });

  it("erzeugt einen Anzeigenamen ohne Wikilink-Syntax", () => {
    const label = toLinkLabel("[[Breezedeus]]");
    expect(label).not.toContain("[[");
    expect(label).not.toContain("]]");
  });
});
