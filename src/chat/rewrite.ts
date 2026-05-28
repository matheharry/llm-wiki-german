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
