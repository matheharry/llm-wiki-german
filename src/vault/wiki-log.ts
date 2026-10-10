import {
  safeWritePage,
  type SafeWriteApp,
} from "./safe-write.js";

/** Default retention period for wiki/log.md entries (30 days / approx. 1 month). */
export const DEFAULT_LOG_RETENTION_DAYS = 30;

/**
 * Prunes sections in wiki/log.md older than cutoffDateStr (YYYY-MM-DD).
 * Keeps the preamble (title, description, frontmatter) intact.
 */
export function pruneWikiLog(
  content: string,
  cutoffDateStr: string,
): string {
  const lines = content.split("\n");
  const preamble: string[] = [];
  const sections: { dateStr: string; lines: string[] }[] = [];

  let currentSection: { dateStr: string; lines: string[] } | null = null;

  for (const line of lines) {
    const headingMatch = line.match(/^##\s+\[?(\d{4}-\d{2}-\d{2})\]?/);
    if (headingMatch) {
      if (currentSection) {
        sections.push(currentSection);
      }
      currentSection = {
        dateStr: headingMatch[1],
        lines: [line],
      };
    } else if (currentSection) {
      currentSection.lines.push(line);
    } else {
      preamble.push(line);
    }
  }

  if (currentSection) {
    sections.push(currentSection);
  }

  // Filter sections to only keep dates >= cutoffDateStr
  const keptSections = sections.filter((s) => s.dateStr >= cutoffDateStr);

  const preambleText = preamble.join("\n").trim();
  const sectionTexts = keptSections.map((s) => s.lines.join("\n").trim());

  if (sectionTexts.length === 0) {
    return preambleText ? `${preambleText}\n` : "";
  }

  if (preambleText) {
    return `${preambleText}\n\n${sectionTexts.join("\n\n")}\n`;
  }

  return `${sectionTexts.join("\n\n")}\n`;
}

/**
 * Appends a chronological entry to wiki/log.md and prunes entries older than
 * retentionDays (default: 30 days / 1 month).
 * If the file doesn't exist, it initializes it with frontmatter/heading.
 */
export async function appendWikiLog(
  app: SafeWriteApp,
  message: string,
  now: () => Date = () => new Date(),
  retentionDays: number = DEFAULT_LOG_RETENTION_DAYS,
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

  // Prune entries older than retention period (default 30 days / 1 month)
  if (retentionDays > 0) {
    const cutoff = new Date(ts.getTime() - retentionDays * 24 * 60 * 60 * 1000);
    const cutoffDateStr = cutoff.toISOString().slice(0, 10);
    updatedContent = pruneWikiLog(updatedContent, cutoffDateStr);
  } else {
    updatedContent = updatedContent.trim() + "\n";
  }

  await safeWritePage(app, relPath, updatedContent);
}

/**
 * Prunes entries older than retentionDays in wiki/log.md without appending a new entry.
 */
export async function cleanWikiLog(
  app: SafeWriteApp,
  now: () => Date = () => new Date(),
  retentionDays: number = DEFAULT_LOG_RETENTION_DAYS,
): Promise<void> {
  const relPath = "wiki/log.md";
  if (!(await app.vault.adapter.exists(relPath))) return;
  const content = await app.vault.adapter.read(relPath);
  const cutoff = new Date(now().getTime() - retentionDays * 24 * 60 * 60 * 1000);
  const cutoffDateStr = cutoff.toISOString().slice(0, 10);
  const pruned = pruneWikiLog(content, cutoffDateStr);
  await safeWritePage(app, relPath, pruned);
}
