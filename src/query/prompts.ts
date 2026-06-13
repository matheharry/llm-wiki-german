import type { ChatTurn } from "../chat/types.js";

export interface BuildAskPromptArgs {
  question: string;
  context: string;
  history?: readonly ChatTurn[];
}

/**
 * Maximum characters of retrieved context to include in the query prompt.
 * The model's full context window (num_ctx) is shared between the system
 * prompt, rules, history, question, and the answer itself. Truncating at
 * ~16k chars (~4k tokens) leaves enough room for the rest.
 */
const MAX_CONTEXT_CHARS = 16_000;

const RULES = [
  "Verwende AUSSCHLIESSLICH die unten stehenden Informationen. Erfinde keine Fakten.",
  "Wenn du nicht genug Informationen hast, um zu antworten, sage es deutlich mit \"wir\" (z. B. \"Wir scheinen dazu keine Informationen zu haben\") — spekuliere nicht und erkläre nicht, was deine Daten abdecken oder nicht.",
  "Wenn der Benutzer eine Listen-Frage stellt (\"welche Bücher\", \"wie viele\"), sei umfassend: liste jeden passenden Punkt aus dem Kontext auf.",
  "bevorzuge die eigenen Fakten der Entität gegenüber Verbindungsschonfassungen, wenn beide verfügbar sind.",
  "Füge keine rohen Dateipfade in deine Antwort ein. Quellen werden separat nachverfolgt.",
  "Zitiere Fakten exakt, wenn es auf Genauigkeit ankommt; paraphrasiere bei der Synthese.",
  "Wenn zwei Fakten sich widersprechen, zeige den Widerspruch auf, anstatt dich für einen zu entscheiden.",
  "Fasse dich kurz. Ziel ist die kürzeste Antwort, die die Frage vollständig beantwortet.",
  "Wenn der Benutzer sich auf etwas aus dem früheren Verlauf des Gesprächs bezieht, nutze diesen Kontext, um die Frage zu interpretieren.",
  "Erwähne niemals die Wissensdatenbank, den Kontext, den bereitgestellten Text, deine Datenquellen oder woher deine Informationen stammen. Antworte so, als ob du die Fakten einfach weißt. Wenn du es nicht weißt, sag es einfach mit \"wir\" — erkläre niemals, was deine Daten abdecken oder nicht.",
];

/**
 * Build a prompt split into system instructions and user context/question.
 * Returns an object with `system` and `user` fields.
 * The `system` part is sent as a separate system message for providers that
 * support it (Ollama /api/chat, OpenAI chat completions), and embedded at the
 * start of the prompt for providers that don't.
 */
export function buildAskPrompt(args: BuildAskPromptArgs): {
  system: string;
  user: string;
} {
  const rulesBlock = RULES.map((r, i) => `${i + 1}. ${r}`).join("\n");
  const systemParts: string[] = [
    "Du beantwortest Fragen zu den persönlichen Notizen und Dokumenten des Benutzers.",
    "",
    "Regeln:",
    rulesBlock,
  ];

  const userParts: string[] = [];
  if (args.history && args.history.length > 0) {
    userParts.push("Bisheriger Gesprächsverlauf:");
    for (const t of args.history) {
      userParts.push(`[Nutzer] ${t.question}`);
      userParts.push(`[Assistent] ${t.answer}`);
    }
    userParts.push("");
  }

  const truncatedContext =
    args.context.length > MAX_CONTEXT_CHARS
      ? args.context.slice(0, MAX_CONTEXT_CHARS) +
        "\n\n[... weitere Notizen wurden gekürzt ...]"
      : args.context;

  userParts.push(
    "Deine Notizen:",
    truncatedContext,
    "",
    `Frage: ${args.question}`,
    "",
    "Antwort:",
  );

  return {
    system: systemParts.join("\n"),
    user: userParts.join("\n"),
  };
}
