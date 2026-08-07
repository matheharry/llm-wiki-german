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
  const entryHeader = `## ${dateStr}`;
  const logLine = `* **Update** [${timeStr}]: ${message}`;

  let content = "";
  if (await app.vault.adapter.exists(relPath)) {
    content = await app.vault.adapter.read(relPath);
  } else {
    content = `# Update Log\n\nProtokoll der Wissensdatenbank-Aktivitäten.\n`;
  }

  // If section for date already exists, append under it; otherwise create heading
  let updatedContent = content.trim();
  if (updatedContent.includes(entryHeader)) {
    updatedContent = updatedContent.replace(
      entryHeader,
      `${entryHeader}\n${logLine}`,
    );
  } else {
    updatedContent = `${updatedContent}\n\n${entryHeader}\n${logLine}`;
  }

  await safeWritePage(app, relPath, updatedContent.trim() + "\n");
}
