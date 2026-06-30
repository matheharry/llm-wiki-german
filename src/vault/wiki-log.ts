import {
  safeWritePage,
  type SafeWriteApp,
} from "./safe-write.js";

/**
 * Appends a chronological entry to wiki/log.md.
 * If the file doesn't exist, it initializes it with frontmatter.
 */
export async function appendWikiLog(
  app: SafeWriteApp,
  message: string,
  now: () => Date = () => new Date(),
): Promise<void> {
  const relPath = "wiki/log.md";
  const ts = now();
  const dateStr = ts.toISOString().slice(0, 10);
  const timeStr = ts.toTimeString().slice(0, 8);
  const entry = `\n## [${dateStr} ${timeStr}] ${message}\n`;

  let content = "";
  if (await app.vault.adapter.exists(relPath)) {
    content = await app.vault.adapter.read(relPath);
  } else {
    content = `---
typ: log
tags:
  - llm-wiki/log
---

# Aktivitäts-Logbuch

Dieses Protokoll erfasst alle Aktivitäten der LLM-Wissensdatenbank.
`;
  }

  await safeWritePage(app, relPath, content.trim() + "\n" + entry);
}
