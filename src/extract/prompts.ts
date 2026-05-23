/**
 * Extraction prompt template. Ported byte-for-byte from
 * ~/tools/llm-wiki/extract.py (EXTRACT_PROMPT) so that both the Python CLI
 * and the plugin produce identical extraction requests for the same model
 * and same vault content.
 */

export interface BuildExtractionPromptArgs {
  vocabulary: string;
  sourcePath: string;
  content: string;
  outputLanguage: string;
}

const TEMPLATE = `Du bist ein System zur Wissensextraktion. Extrahiere strukturiertes Wissen aus dem gegebenen Dokument unter Berücksichtigung des Vokabulars bereits bekannter Entitäten und Konzepte.

REGELN:
1. Wenn eine Entität oder ein Konzept bereits im Vokabular existiert, VERWENDE EXAKT DIESEN NAMEN. Erstelle keine Duplikate oder Varianten.
2. Erstelle eine NEUE Entität oder ein neues Konzept nur dann, wenn sie eindeutig nicht im Vokabular vorhanden sind.
3. Sei konservativ — extrahiere nur das, was im Dokument tatsächlich steht, keine Schlussfolgerungen.
4. Die gesamte Ausgabe muss in {output_language} erfolgen, unabhängig von der Sprache des Quelltexts.
5. Jede Entität benötigt einen Typ: person, org, tool, project, book, article, place, event, other.
6. Verbindungen haben einen Typ: influences, uses, critiques, extends, part-of, created-by, related-to, applies-to, contrasts-with.

AKTUELLES VOKABULAR:
{vocabulary}

DOKUMENT ({source_path}):
---
{content}
---

Antworte NUR mit einem JSON-Objekt, keine Markdown-Blöcke, kein Kommentar:
{
  "source_summary": "1-2 Sätze Zusammenfassung, worum es in diesem Dokument geht",
  "entities": [
    {
      "name": "Exakter Name",
      "type": "person|org|tool|project|book|article|place|event|other",
      "aliases": ["optional", "andere Namen"],
      "facts": ["Faktische Aussage aus diesem Dokument"]
    }
  ],
  "concepts": [
    {
      "name": "Name des Konzepts",
      "definition": "Kurze Definition basierend auf dem Dokumentinhalt",
      "related": ["Namen verwandter Konzepte oder Entitäten"]
    }
  ],
  "connections": [
    {
      "from": "Name der Entität oder des Konzepts",
      "to": "Name der Entität oder des Konzepts",
      "type": "influences|uses|critiques|extends|part-of|created-by|related-to|applies-to|contrasts-with",
      "description": "Kurze Beschreibung der Beziehung"
    }
  ]
}
`;

export function buildExtractionPrompt(
  args: BuildExtractionPromptArgs,
): string {
  const replacements: Record<string, string> = {
    vocabulary: args.vocabulary,
    source_path: args.sourcePath,
    output_language: args.outputLanguage,
    content: args.content,
  };

  return TEMPLATE.replace(
    /\{(vocabulary|source_path|output_language|content)\}/g,
    (_match, key: string) => replacements[key] ?? "",
  );
}
