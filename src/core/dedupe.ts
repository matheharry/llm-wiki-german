import type { LLMProvider } from "../llm/provider.js";

/**
 * Sends a list of facts for an entity to the LLM to deduplicate/consolidate them.
 * Returns the consolidated list of facts, or the original list if the process fails
 * or the LLM's response cannot be parsed.
 */
export async function deduplicateEntityFacts(
  provider: LLMProvider,
  model: string,
  entityName: string,
  entityType: string,
  facts: string[],
  signal?: AbortSignal,
): Promise<string[]> {
  if (facts.length < 2) return facts;

  const prompt = `Du bist ein präziser Editor für eine Wissensdatenbank.
Hier ist eine Liste von Fakten über die Entität "${entityName}" (Typ: "${entityType}"):
${facts.map((f, i) => `${i + 1}. ${f}`).join("\n")}

Deine Aufgabe ist es, redundante Fakten zu konsolidieren. 
Fakten sind redundant, wenn sie sich inhaltlich überschneiden oder die gleiche Information nur mit anderen Worten ausdrücken.
Führe solche Fakten zusammen und behalte die präziseste/detaillierteste Formulierung bei.
Lass eigenständige, unterschiedliche Fakten unverändert.
Gib die bereinigte Liste der Fakten im JSON-Format aus als ein Array von Strings, z.B.:
[
  "Fakt 1",
  "Fakt 2"
]

Antworte AUSSCHLIESSLICH mit dem validen JSON-Array. Keine Einleitung, keine Erklärung, keine Markdown-Formatierung außer optionalen Fences.`;

  try {
    let rawResponse = "";
    for await (const chunk of provider.complete({
      prompt,
      model,
      temperature: 0.1,
      signal,
    })) {
      rawResponse += chunk;
    }

    const parsed = parseStringArray(rawResponse);
    if (parsed && parsed.length > 0) {
      return parsed;
    }
  } catch (error) {
    console.error(`Failed to deduplicate facts for entity ${entityName}:`, error);
  }

  return facts;
}

/**
 * Robustly parses a JSON string array from the LLM response.
 */
function parseStringArray(raw: string): string[] | null {
  if (!raw) return null;
  let text = raw.trim();
  if (!text) return null;

  // Strip markdown code fences if present
  text = text.replace(/^```(?:json)?\s*\n?/i, "");
  text = text.replace(/\n?```\s*$/i, "");
  text = text.trim();

  // Find the outermost [ ... ]
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return null;
  text = text.slice(start, end + 1);

  // Fix trailing commas
  text = text.replace(/,(\s*[\]])/g, "$1");

  try {
    const data = JSON.parse(text);
    if (Array.isArray(data)) {
      return data
        .map((item) => String(item).trim())
        .filter((s) => s.length > 0);
    }
  } catch {
    // ignore and return null
  }

  return null;
}
