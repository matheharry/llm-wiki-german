# LLM Wiki German

**Deutsche Wissensdatenbank für Obsidian — lokal, privat, LLM-gestützt.**

Dieses Plugin ist ein Fork von [domleca/llm-wiki](https://github.com/domleca/llm-wiki) und wurde stark an die deutsche Sprache angepasst. Während das Original rein auf die englische Sprache ausgelegt ist, nutzt LLM Wiki German vollständig deutsche Prompts für Extraktion und Abfrage, deutsche UI-Elemente und für den deutschen Sprachraum optimierte Standardmodelle. Die für englische Texte optimierte Indizierung wurde erweitert, damit die Eigenheiten und die größere Komplexität der deutschen Texte und Grammatik berücksichtigt werden. 

Darüber hinaus wurden zahlreiche zusätzliche Features eingebaut, die über das Original hinausgehen:

- **Mistral** als integrierter LLM-Provider
- **LlamaCpp** als lokaler Provider
- **OpenAI-kompatibler Provider** — nutze jeden OpenAI-kompatiblen Endpunkt
- **Extraktionssprache** einstellbar (Deutsch, Englisch, Französisch, Spanisch, Italienisch, Niederländisch, Portugiesisch)
- **Multi-Folder-Index** — wähle bestimmte Ordner für die Wissensdatenbank aus
- **Inhaltsbasierte Deduplizierung** mittels SHA-256-Hashes
- **Integritätsprüfung (Lint)** der Wissensdatenbank mit automatischer Fehlerbehebung
- **Wiki-Log** — protokolliert alle Änderungen in `wiki/wiki-log.md`
- **Interaktions-Log** — zeichnet Fragen und Antworten auf
- **Willkommens-Modal** für die Ersteinrichtung
- **Deutsche Standard-Skip-Verzeichnisse** (z. B. "Vorlagen")

Gedacht war dieses Projekt als Proof of Concept, ob die LLM-Wiki-Idee auch mit deutschen Texten hilfreiche Ergebnisse bringt.  

---

Deine Notizen enthalten bereits eine Fülle an Wissen — verteilt über viele Dateien, lose verbunden, schwer durchsuchbar.
LLM Wiki German liest dein Obsidian-Vault, extrahiert die Personen, Ideen und Zusammenhänge und lässt dich Fragen in natürlicher Sprache stellen.

**Chatte privat mit deinen Notizen.**
Alles läuft lokal auf deinem Rechner. Kein Cloud-Konto erforderlich. Deine Notizen verlassen nie deinen Computer. Du kannst aber auch Anthropic, OpenAI, Google oder Mistral nutzen, wenn du möchtest.

![LLM Wiki demo — Fragen an deine Notizen stellen](docs/assets/hero-demo.gif)

## Quick Start

Du brauchst zwei Dinge: [Ollama](https://ollama.com) (eine kostenlose, lokale LLM-Laufzeitumgebung) und das Plugin selbst.

**1. Ollama installieren und die Modelle laden**

Lade Ollama von [ollama.com](https://ollama.com) herunter oder installiere es via Terminal:

```bash
# Mac
brew install ollama

# Linux
curl -fsSL https://ollama.com/install.sh | sh
```

Dann die Modelle laden:

```bash
ollama pull gemma4:e4b-it-qat
ollama pull qllama/multilingual-e5-base
```

Das erste Modell (`gemma4:e4b-it-qat`) liest deine Notizen und beantwortet deine Fragen. Das zweite (`qllama/multilingual-e5-base`) ermöglicht die semantische Suche — es findet relevante Notizen, selbst wenn du nicht die exakt gleichen Wörter verwendest.

Stand Juli 2026 sind beide Modelle die vernünftigste Option für ein lokales Setup unter Berücksichtigung der Sprache Deutsch.

**2. Plugin installieren**

*Manuelle Installation:* Lade diese drei Dateien aus dem aktuellen [Release](https://github.com/matheharry/llm-wiki-german/releases) herunter:

- `main.js`
- `manifest.json`
- `styles.css`

Lege sie in `<dein-vault>/.obsidian/plugins/llm-wiki-german/` ab — erstelle den Ordner, falls er nicht existiert. Dann in Obsidian: Einstellungen > Community-Plugins, stelle sicher, dass Community-Plugins aktiviert sind (ggf. Eingeschränkten Modus deaktivieren), und aktiviere **LLM Wiki German**. Falls es nicht sofort in der Liste erscheint, klicke auf den Aktualisieren-Button neben "Installierte Plugins".

**3. Deine Wissensdatenbank indizieren**

Öffne die Befehlspalette (`Cmd+P` / `Ctrl+P`) und führe **LLM Wiki German: Extrahierung starten** aus. Das Plugin durchsucht deinen Vault, sendet jede Notiz an das lokale Modell und baut eine strukturierte Wissensdatenbank auf. Der Fortschritt wird in der Statusleiste angezeigt.

> **Das dauert eine Weile.** Die erste Extrahierung verarbeitet jede Notiz einzeln, was schnell einmal einige Stunden dauern kann. 
> Nach dem ersten Durchlauf werden nur geänderte Notizen neu extrahiert — Updates dauern Sekunden, nicht Stunden.

**4. Stelle deinem Vault eine Frage**

Führe den Befehl **Wissensdatenbank abfragen** aus (oder klicke auf das Ribbon-Symbol). Gib eine Frage ein. Die Antworten werden gestreamt und enthalten klickbare Links zurück zu den Quellnotizen.

> **Tipp:** Lege einen Hotkey für schnellen Zugriff fest. Gehe zu Einstellungen > Hotkeys, suche nach "Wissensdatenbank abfragen" und weise eine Tastenkombination zu — `Alt+W` funktioniert gut.

Das war's. Du bist startklar.

## Was das Plugin kann

- **Extrahiert Wissen aus deinen Notizen** — Entitäten (Personen, Organisationen, Werkzeuge, Bücher, Orte, Ereignisse), Konzepte (Ideen, Theorien, Frameworks) und 9 Arten von Verbindungen zwischen ihnen.
- **Beantwortet Fragen in natürlicher Sprache** — ein Chat-Interface, das auf deinen eigenen Texten basiert, mit Quellenangaben, damit du jede Antwort überprüfen kannst.
- **Hybride Suche** — kombiniert Stichwortsuche, semantische Ähnlichkeit und Vault-Struktur, um den richtigen Kontext zu finden, selbst wenn deine Frage andere Wörter verwendet als deine Notizen.
- **Weiß, wenn es etwas nicht weiß** — wenn dein Vault nicht genug zu einem Thema enthält, sagt es das, anstatt etwas zu erfinden.
- **Generiert Wiki-Seiten** — strukturierte Markdown-Seiten für jede Entität, jedes Konzept und jede Quelle, organisiert in `wiki/`-Ordnern, kompatibel mit Obsidian [Bases](https://obsidian.md/bases).
- **Bleibt auf dem Laufenden** — das Speichern einer Notiz löst eine Hintergrund-Neuxtraktion aus. Optionaler nächtlicher Voll-Durchlauf.
- **Mehrere Gesprächsrunden** — Chats werden gespeichert und sind fortsetzbar. Setze dort fort, wo du aufgehört hast.
- **Mehrere Anbieter** — Ollama (lokal, kostenlos) standardmäßig. OpenAI, Anthropic, Google und Mistral als Optionen in den Einstellungen.
- **OpenAI-kompatibler Provider** — verwende jeden beliebigen OpenAI-kompatiblen Endpunkt (z. B. eigene Server, LM Studio, etc.).
- **LlamaCpp-Unterstützung** — alternative lokale LLM-Backend-Option.
- **Integritätsprüfung (Lint)** — analysiert die Wissensdatenbank auf Probleme und bietet automatische Fehlerbehebung (z. B. redundante Fakten, verwaiste Verbindungen).
- **Wiki-Log** — alle Extraktionen, Löschungen und Abfragen werden in `wiki/log.md` protokolliert.
- **Extraktionssprache wählbar** — lege fest, in welcher Sprache extrahiert werden soll (App-Sprache, Deutsch, Englisch, Französisch, Spanisch, Italienisch, Niederländisch, Portugiesisch).

| | |
|---|---|
| ![Abfrage-Modal](docs/assets/query-modal.png) | ![Chat-Antwort](docs/assets/chat-answer.png) |
| ![Quellen](docs/assets/chat-sources.png) | ![Einstellungen](docs/assets/settings.png) |

## Befehle

| Befehl | Funktion |
|---|---|
| Wissensdatenbank abfragen | Öffnet das Chat-Modal |
| Extrahierung starten | Indiziert den gesamten Vault neu |
| aktuelle Datei extrahieren | Extrahiert nur die aktive Notiz neu |
| laufende Extrahierung abbrechen | Bricht eine laufende Extraktion ab |
| Seiten aus Wissensdatenbank neu generieren | Baut alle Wiki-Seiten neu auf |
| Wissensdatenbank von der Festplatte neu laden | Lädt die Wissensdatenbank ohne Neu-Extraktion |
| Wortschatz anzeigen | Zeigt die rohe Wissensdatenbank an |
| Wissensdatenbank aufräumen und prüfen | Führt eine Integritätsprüfung und Reparatur durch |

## Cloud-Anbieter (optional)

Das Standard-Setup ist komplett lokal — keine Anmeldung bei einem Dienst, nichts zu bezahlen. Wenn du stattdessen ein Cloud-Modell verwenden möchtest (schneller oder für größere Vaults), gehe zu Einstellungen > LLM Wiki German, wähle einen Anbieter und gib deinen API-Schlüssel ein.

| Anbieter | Chat-Modelle | Embedding |
|---|---|---|
| Ollama (Standard) | gemma4:e4b-it-qat u. a. | qllama/multilingual-e5-base |
| OpenAI | GPT-4o, GPT-4o mini, GPT-4.1, o3-mini | text-embedding-3-small / large |
| Anthropic | Claude Sonnet 4, Claude Haiku 4, Claude 3.5 Haiku | verwendet Ollama-Fallback |
| Google | Gemini 2.5 Flash, Gemini 2.0 Flash, Gemini 2.0 Flash Lite | text-embedding-004 |
| Mistral | Ministral 3B, Ministral 8B, Mistral Small | mistral-embed |
| LlamaCpp | Lokales Modell (z. B. gemma-4-E4B_q4_0-it) | Lokales Embedding-Modell |
| OpenAI-kompatibel | Eigenes Modell (z. B. über LM Studio, vLLM, etc.) | Eigenes Embedding-Modell |

Cloud-Anbieter senden Notiz-Inhalte an die API des Anbieters. Wenn dir Privatsphäre wichtig ist, bleib bei Ollama.

## Deine Notizen, das Wiki und deine Chats

**Deine vorhandenen Notizen werden niemals verändert. Alles, was das Plugin generiert, befindet sich in einem Ordner  `wiki/`!**

LLM Wiki German trennt drei Dinge sauber:

- **Deine Notizen** — das Rohmaterial. Alles, was du bereits in deinem Vault geschrieben hast. LLM Wiki German liest sie, verändert sie aber nie.
- **Das Wiki** — eine strukturierte Wissensdatenbank, die *aus* deinen Notizen erstellt wurde. Sie befindet sich in einem `wiki/`-Ordner in deinem Vault und wird für Abfragen durchsucht.
- **Deine Chats** — die Antworten, die LLM Wiki German dir gibt. Gespeichert, damit du Gespräche fortsetzen kannst, getrennt von deinen Notizen und dem Wiki.

Der `wiki/`-Ordner sieht so aus:

```
wiki/
  kb.json                 Wissensdatenbank (die strukturierten Daten)
  index.md                Katalogseite
  entities/               eine Seite pro Entität
  concepts/               eine Seite pro Konzept
  sources/                eine Seite pro Quellnotiz
  log.md             Protokoll aller Extraktionen und Abfragen
  lint-report.md          Bericht der Integritätsprüfung (optional)
```

Standardmäßig ist der `wiki/`-Ordner vor Suche, Quick Switcher und Graph-Ansicht versteckt — er überlädt deinen Vault nicht und bringt deine Links nicht durcheinander. Falls du neugierig bist und die generierten Seiten durchstöbern möchtest, kannst du sie in den Einstellungen unter LLM Wiki German > Darstellung sichtbar machen. Deine ursprünglichen Notizen bleiben in jedem Fall genau so, wie sie waren - es kommen "nur" Verknüpfungen zu den Überbegriffen im Wiki hinzu, wodurch *Zusammenhänge zwischen den Notizen automatisch hergestellt* werden.

## Wie es funktioniert

LLM Wiki German verwandelt deine unstrukturierten Notizen in eine strukturierte Wissensdatenbank und nutzt diese Struktur, um Fragen zu beantworten. Hier eine kurze Beschreibung, was unter der Haube passiert:

**Extrahierung.** Wenn du die Extrahierung ausführst, liest das Plugin jede Notiz in deinem Vault und sendet sie an ein LLM mit einem Prompt wie "welche Entitäten, Konzepte und Verbindungen sind in diesem Text?" Das Modell gibt strukturierte Daten zurück — Namen, Typen, Beschreibungen, Beziehungen — die in einer einzigen Wissensdatenbank (`wiki/kb.json`) zusammengeführt werden. Stell es dir so vor, als würde das Plugin alle deine Notizen lesen und eine mentale Karte von allem darin erstellen.

**Seitengenerierung.** Aus dieser Wissensdatenbank schreibt das Plugin eine Markdown-Seite pro Entität, Konzept und Quellnotiz in den `wiki/`-Ordner. Diese Seiten sind einfaches Markdown mit Frontmatter, sodass sie mit Obsidians Bases-Funktion zum Filtern und Sortieren funktionieren. Du erhältst ein durchsuchbares Wiki deines eigenen Wissens, automatisch gepflegt.

**Abruf.** Wenn du eine Frage stellst, sendet das Plugin nicht dein gesamtes Vault an das LLM — das wäre zu langsam und zu umfangreich. Stattdessen durchsucht es die Wissensdatenbank nach den relevantesten Kontexten. Es verwendet drei Strategien parallel: 

- Stichwortsuche (findet Notizen mit denselben Begriffen), 
- semantische Ähnlichkeit (findet Notizen mit ähnlicher Bedeutung, auch mit anderen Wörtern — das macht das Embedding-Modell) und 
- Vault-Struktur (bevorzugt Notizen in Ordnern, die du ausgewählt hast). 
 
Die Ergebnisse werden mit einer Technik namens Reciprocal Rank Fusion zusammengeführt, die mehrere Ranglisten zu einer kombiniert.

**Beantwortung.** Der am höchsten bewertete Kontext wird zusammen mit deiner Frage und dem Gesprächsverlauf in einen Prompt verpackt und an das LLM gesendet. Die Antwort wird Token für Token gestreamt. Anschließend gleicht das Plugin die Antwort mit den abgerufenen Quellen ab und zeigt sie als klickbare Links an, damit du die Quellen selbst überprüfen kannst.

**Auf dem Laufenden bleiben.** Wenn du eine Notiz speicherst, extrahiert das Plugin nur diese Datei im Hintergrund neu — kein erneutes Indizieren des gesamten Vaults nötig. Es gibt auch einen optionalen nächtlichen Planer für eine vollständige Aktualisierung.

**Integritätsprüfung (Lint).** Der Befehl "Wissensdatenbank aufräumen und prüfen" analysiert die gesamte Wissensdatenbank auf Probleme wie verwaiste Verbindungen, fehlende Quellen, doppelte Einträge und redundante Fakten. Für einige Probleme bietet das Plugin eine automatische Bereinigung an, z. B. das Entfernen verwaister Verbindungen oder das Zusammenführen redundanter Fakten mittels LLM.

**Protokollierung.** Alle Extraktionen, Dateilöschungen und Abfragen werden in `wiki/log.md` protokolliert, sodass du jederzeit nachvollziehen kannst, was mit deiner Wissensdatenbank passiert ist.

## Datenschutz

- Mit Ollama (der Standardeinstellung) erfolgt die gesamte Verarbeitung auf deinem Rechner. Es wird nichts nach außen gesendet.
- Cloud-Anbieter erfordern das Senden von Notiz-Inhalten an deren APIs. Dies ist opt-in und in den Einstellungen klar gekennzeichnet.
- Keine Telemetrie, kein Analytics, kein Tracking irgendeiner Art.
