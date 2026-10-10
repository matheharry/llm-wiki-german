/**
 * LLM call that rewrites a follow-up question into a standalone form, using
 * conversation history to resolve pronouns and implied subjects. Used by the
 * chat-turn flow before retrieval so hybrid search sees a self-contained query.
 */

import type { LLMProvider } from "../llm/provider.js";
import type { ChatTurn } from "./types.js";

export interface RewriteArgs {
  provider: LLMProvider;
  model: string;
  history: readonly ChatTurn[];
  question: string;
  signal?: AbortSignal;
}

function buildRewritePrompt(
  history: readonly ChatTurn[],
  question: string,
): string {
  const lines: string[] = [
    "Formuliere die letzte Frage des Nutzers in einem einzigen, in sich geschlossenen Satz um, der auch ohne Kenntnis des vorangegangenen Gesprächs verständlich ist.",
    "Finde die Pronomen und implizierten Themen anhand des folgenden Gesprächs heraus.",
    "Gib NUR die umformulierte Frage aus, ohne Einleitung, ohne Anführungszeichen und ohne Erklärung.",
    "",
    "Gespräch:",
  ];
  for (const t of history) {
    lines.push(`[user] ${t.question}`);
    lines.push(`[assistant] ${t.answer}`);
  }
  lines.push("", `Aktuelle Frage: ${question}`, "", "Separate Frage:");
  return lines.join("\n");
}

const FOLLOW_UP_PRONOUNS = new Set([
  // German
  "er", "sie", "es", "ihn", "ihm", "ihr", "ihre", "ihren", "ihrem", "ihrer", "ihres",
  "sein", "seine", "seinen", "seinem", "seiner", "seines",
  "dieser", "diese", "dieses", "diesem", "diesen",
  "davon", "dazu", "darüber", "damit", "darauf", "daran", "daraus",
  "dort", "da", "dessen", "deren",
  // English
  "it", "its", "he", "him", "his", "she", "her", "hers",
  "they", "them", "their", "theirs", "this", "that", "these", "those",
  "there",
]);

/**
 * Heuristic check whether a chat question needs LLM-based follow-up rewriting.
 * Returns true if the question is an elliptical fragment or contains pronouns
 * referring back to prior conversation turns.
 */
export function needsFollowUpRewrite(question: string): boolean {
  const trimmed = question.trim().toLowerCase();
  if (!trimmed) return false;

  // Very short elliptical follow-up questions ("und warum?", "and why?", "warum?")
  const words = trimmed.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
  if (words.length <= 3) return true;

  // Check for pronouns/demonstratives indicating reference to prior turns
  for (const w of words) {
    if (FOLLOW_UP_PRONOUNS.has(w)) return true;
  }

  // Common German and English follow-up prefixes
  if (/^(und |and |aber |but |wie steht es mit |was ist mit |how about |what about )/i.test(trimmed)) {
    return true;
  }

  return false;
}

export async function rewriteFollowUp(args: RewriteArgs): Promise<string> {
  const prompt = buildRewritePrompt(args.history, args.question);
  let out = "";
  for await (const chunk of args.provider.complete({
    prompt,
    model: args.model,
    temperature: 0.1,
    signal: args.signal,
  })) {
    out += chunk;
  }
  const trimmed = out.trim();
  return trimmed.length > 0 ? trimmed : args.question;
}

