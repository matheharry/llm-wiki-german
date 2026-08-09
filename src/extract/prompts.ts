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
7. Der in Klammern angegebene Pfad/Dateiname bei DOKUMENT dient nur als Kontext. Erstelle KEINE Entitäten oder Konzepte, die lediglich der Dateiname, Ordnerpfad oder Notiztitel sind (z.B. Dateiendungen wie .md, Pfade wie Notizen/... oder Dateinamen). Extrahiere nur echte eigenständige Personen, Organisationen, Werkzeuge, Projekte, Bücher, Ereignisse oder Fachkonzepte aus dem Textinhalt.
8. Auch wenn das Dokument hauptsächlich aus Quellcode, HTML, CSS oder Skripten besteht, antworte IMMER exakt im geforderten JSON-Format. Fasse in "source_summary" zusammen, welche Funktion der Code hat.

AKTUELLES VOKABULAR:
{vocabulary}

DOKUMENT ({source_path}):
---
{content}
---

Antworte NUR mit einem JSON-Objekt, keine Markdown-Blöcke, kein Kommentar:
{
  "source_summary": "2-5 Sätze ausführliche Zusammenfassung, worum es in diesem Dokument geht, was die wichtigsten Punkte sind und welchen Wert es hat (für den Notiz-Body)",
  "source_summary_short": "Exakt 1 Satz als prägnante Kurzzusammenfassung des Dokuments (für OKF-Frontmatter description)",
  "entities": [
    {
      "name": "Exakter Name",
      "type": "person|org|tool|project|book|article|place|event|other",
      "aliases": ["optional", "andere Namen"],
      "facts": ["Faktische Aussage aus diesem Dokument"],
      "short_description": "Exakt 1 Satz Kurzbeschreibung der Rolle oder Funktion (für OKF-Frontmatter description)"
    }
  ],
  "concepts": [
    {
      "name": "Name des Konzepts",
      "definition": "Ausführliche Definition/Erklärung in 2-5 Sätzen: Was ist das Konzept, wie wird es im Dokument beschrieben, und warum ist es relevant? (für den Notiz-Body)",
      "short_description": "Exakt 1 Satz prägnante Definition (für OKF-Frontmatter description)",
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
