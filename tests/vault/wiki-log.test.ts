import { describe, it, expect } from "vitest";
import {
  appendWikiLog,
  pruneWikiLog,
  cleanWikiLog,
  DEFAULT_LOG_RETENTION_DAYS,
} from "../../src/vault/wiki-log.js";
import { createMockApp } from "../helpers/mock-app.js";

describe("wiki-log", () => {
  describe("pruneWikiLog", () => {
    it("keeps sections >= cutoff date and removes older sections", () => {
      const content = `# Update Log

Protokoll der Wissensdatenbank-Aktivitäten.

## 2026-08-10
* **Update** [01:28:24]: Ingest | Alt 1
* **Update** [21:10:56]: Ingest | Alt 2

## 2026-09-15
* **Update** [12:00:00]: Ingest | Mittelalt

## 2026-10-09
* **Update** [18:18:39]: Qualitätsfilter | Neu
`;

      const pruned = pruneWikiLog(content, "2026-09-15");
      expect(pruned).not.toContain("2026-08-10");
      expect(pruned).not.toContain("Alt 1");
      expect(pruned).not.toContain("Alt 2");
      expect(pruned).toContain("## 2026-09-15");
      expect(pruned).toContain("Mittelalt");
      expect(pruned).toContain("## 2026-10-09");
      expect(pruned).toContain("Neu");
      expect(pruned).toContain("# Update Log");
      expect(pruned).toContain("Protokoll der Wissensdatenbank-Aktivitäten.");
    });

    it("handles bracketed date headings ## [YYYY-MM-DD]", () => {
      const content = `# Update Log

## [2026-08-01]
* **Update** [10:00:00]: Alt

## [2026-10-05]
* **Update** [10:00:00]: Neu
`;
      const pruned = pruneWikiLog(content, "2026-09-01");
      expect(pruned).not.toContain("2026-08-01");
      expect(pruned).toContain("## [2026-10-05]");
      expect(pruned).toContain("Neu");
    });

    it("preserves preamble even if all date sections are pruned", () => {
      const content = `# Update Log

Protokoll der Wissensdatenbank-Aktivitäten.

## 2026-07-01
* **Update** [10:00:00]: Sehr alt
`;
      const pruned = pruneWikiLog(content, "2026-10-01");
      expect(pruned).not.toContain("2026-07-01");
      expect(pruned).toBe("# Update Log\n\nProtokoll der Wissensdatenbank-Aktivitäten.\n");
    });

    it("leaves content unchanged when all sections are within cutoff", () => {
      const content = `# Update Log

Protokoll der Wissensdatenbank-Aktivitäten.

## 2026-10-08
* **Update** [10:00:00]: Gestern

## 2026-10-09
* **Update** [10:00:00]: Heute
`;
      const pruned = pruneWikiLog(content, "2026-10-01");
      expect(pruned).toContain("2026-10-08");
      expect(pruned).toContain("2026-10-09");
    });
  });

  describe("appendWikiLog", () => {
    it("creates wiki/log.md on first append", async () => {
      const { app, files } = createMockApp();
      const now = () => new Date("2026-10-09T18:00:00Z");

      await appendWikiLog(app, "Erster Eintrag", now);
      const content = files.get("wiki/log.md")?.content;
      expect(content).toBeDefined();
      expect(content).toContain("# Update Log");
      expect(content).toContain("## 2026-10-09");
      expect(content).toContain("Erster Eintrag");
    });

    it("appends multiple entries under the same date", async () => {
      const { app, files } = createMockApp();
      const now = () => new Date("2026-10-09T18:00:00Z");

      await appendWikiLog(app, "Eintrag 1", now);
      await appendWikiLog(app, "Eintrag 2", now);

      const content = files.get("wiki/log.md")!.content;
      expect(content).toContain("Eintrag 1");
      expect(content).toContain("Eintrag 2");
      // Only one date heading
      const matches = content.match(/## 2026-10-09/g);
      expect(matches).toHaveLength(1);
    });

    it("automatically prunes entries older than 30 days", async () => {
      const { app, files } = createMockApp();

      // Seed log with an entry from 2 months ago and 1 month ago
      files.set("wiki/log.md", {
        path: "wiki/log.md",
        content: `# Update Log

Protokoll der Wissensdatenbank-Aktivitäten.

## 2026-08-01
* **Update** [10:00:00]: Vor 2 Monaten

## 2026-09-25
* **Update** [10:00:00]: Vor 2 Wochen
`,
        mtime: 1,
        ctime: 1,
      });

      // Append entry on 2026-10-09 (cutoff 30 days = 2026-09-09)
      const now = () => new Date("2026-10-09T12:00:00Z");
      await appendWikiLog(app, "Neuer Eintrag heute", now);

      const content = files.get("wiki/log.md")!.content;
      // August entry (> 30 days) must be pruned
      expect(content).not.toContain("2026-08-01");
      expect(content).not.toContain("Vor 2 Monaten");
      // September 25 entry (< 30 days) must be retained
      expect(content).toContain("2026-09-25");
      expect(content).toContain("Vor 2 Wochen");
      // Today's entry must be present
      expect(content).toContain("2026-10-09");
      expect(content).toContain("Neuer Eintrag heute");
    });

    it("DEFAULT_LOG_RETENTION_DAYS is 30", () => {
      expect(DEFAULT_LOG_RETENTION_DAYS).toBe(30);
    });
  });

  describe("cleanWikiLog", () => {
    it("prunes old entries without appending a new entry", async () => {
      const { app, files } = createMockApp();
      files.set("wiki/log.md", {
        path: "wiki/log.md",
        content: `# Update Log

Protokoll der Wissensdatenbank-Aktivitäten.

## 2026-08-01
* **Update** [10:00:00]: Alt

## 2026-10-05
* **Update** [10:00:00]: Kürzlich
`,
        mtime: 1,
        ctime: 1,
      });

      const now = () => new Date("2026-10-09T12:00:00Z");
      await cleanWikiLog(app, now, 30);

      const content = files.get("wiki/log.md")!.content;
      expect(content).not.toContain("2026-08-01");
      expect(content).toContain("2026-10-05");
      expect(content).toContain("Kürzlich");
    });

    it("does nothing gracefully if wiki/log.md does not exist", async () => {
      const { app } = createMockApp();
      await expect(cleanWikiLog(app)).resolves.not.toThrow();
    });
  });
});
