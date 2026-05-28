import type { ChatTurn } from "../chat/types.js";

export interface BuildAskPromptArgs {
  question: string;
  context: string;
  history?: readonly ChatTurn[];
}

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

export function buildAskPrompt(args: BuildAskPromptArgs): string {
  const rulesBlock = RULES.map((r, i) => `${i + 1}. ${r}`).join("\n");
  const parts: string[] = [
    "Du beantwortest Fragen zu den persönlichen Notizen und Dokumenten des Benutzers.",
    "",
    "Regeln:",
    rulesBlock,
    "",
  ];
  if (args.history && args.history.length > 0) {
    parts.push("Bisheriger Gesprächsverlauf:");
    for (const t of args.history) {
      parts.push(`[Nutzer] ${t.question}`);
      parts.push(`[Assistent] ${t.answer}`);
    }
    parts.push("");
  }
  parts.push(
    "Deine Notizen:",
    args.context,
    "",
    `Frage: ${args.question}`,
    "",
    "Antwort:",
  );
  return parts.join("\n");
}
