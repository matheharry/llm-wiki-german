# LLM Wiki German

![Version](https://img.shields.io/badge/version-1.1.0c-blue) ![Obsidian Plugin](https://img.shields.io/badge/Obsidian-Plugin-7c3aed)

**Deutsche Wissensdatenbank für Obsidian — lokal, privat, LLM-gestützt und Open Knowledge Format (OKF) konform.**

Dieses Plugin ist ein Fork von [domleca/llm-wiki](https://github.com/domleca/llm-wiki) und wurde vollständig auf die deutsche Sprache ausgerichtet. Es nutzt deutsche Prompts für Extraktion und Abfrage, deutsche UI-Elemente und für den deutschen Sprachraum optimierte Standardmodelle. Die Indizierung berücksichtigt die Eigenheiten und die größere Morphologie der deutschen Grammatik.

Gegenüber dem Original wurden folgende Features ergänzt:

- **Open Knowledge Format (OKF) v0.2** — strukturiertes Frontmatter für Portabilität und Maschinenlesbarkeit
- **Mistral**, **LlamaCpp** und **OpenAI-kompatibler Provider** als zusätzliche Anbieter
- **Extraktionssprache** einstellbar (Deutsch, Englisch, Französisch, Spanisch, Italienisch, Niederländisch, Portugiesisch)
- **Multi-Folder-Index** — wähle bestimmte Ordner für die Wissensdatenbank aus
- **Inhaltsbasierte Deduplizierung** mittels SHA-256-Hashes
- **Integritätsprüfung (Lint)** mit automatischer Fehlerbehebung
- **Wiki-Log** (`wiki/log.md`) und **Interaktions-Log** für vollständige Nachvollziehbarkeit
- **Willkommens-Modal** mit geführter Ersteinrichtung

Näheres zu Intention und Vorgehensweise: [matheharry.bplaced.net/llmwikiprojekt](http://matheharry.bplaced.net/llmwikiprojekt)

---

Deine Notizen enthalten bereits eine Fülle an Wissen — verteilt über viele Dateien, lose verbunden, schwer durchsuchbar.
LLM Wiki German liest dein Obsidian-Vault, extrahiert die Personen, Ideen und Zusammenhänge und lässt dich Fragen in natürlicher Sprache stellen.

**Chatte privat mit deinen Notizen.**
Alles läuft lokal auf deinem Rechner. Kein Cloud-Konto erforderlich. Deine Notizen verlassen nie deinen Computer. Du kannst aber auch Anthropic, OpenAI, Google oder Mistral nutzen, wenn du möchtest.

> [!IMPORTANT]
> **Deine vorhandenen Notizen werden niemals verändert.** Alles, was das Plugin generiert, landet ausschließlich im `wiki/`-Ordner.

![LLM Wiki demo — Fragen an deine Notizen stellen](docs/assets/hero-demo.gif)

## Quick Start

Du brauchst zwei Dinge: [Ollama](https://ollama.com) (eine kostenlose, lokale LLM-Laufzeitumgebung) und das Plugin selbst.

**1. Ollama installieren und die Modelle laden**

Installiere [Ollama](https://ollama.com), dann lade die beiden Modelle:

```bash
ollama pull gemma4:e4b-it-qat
ollama pull embeddinggemma
```

Das erste Modell (`gemma4:e4b-it-qat`) liest deine Notizen und beantwortet deine Fragen. Das zweite (`embeddinggemma`) ermöglicht die semantische Suche — es findet relevante Notizen, selbst wenn du nicht die exakt gleichen Wörter verwendest. Beide liefern auch schon mit 8 GB dediziertem Speicher eine gute Leistung.

**2. Plugin installieren**

Lade diese drei Dateien aus dem aktuellen [Release](https://github.com/matheharry/llm-wiki-german/releases) herunter:

- `main.js`
- `manifest.json`
- `styles.css`

Lege sie in `<dein-vault>/.obsidian/plugins/llm-wiki-german/` ab (erstelle den Ordner, falls er nicht existiert). Dann in Obsidian:

1. Einstellungen → Community-Plugins
2. Eingeschränkten Modus deaktivieren, falls nötig
3. **LLM Wiki German** aktivieren (ggf. auf „Aktualisieren" klicken, falls es nicht sofort erscheint)

**3. Deine Wissensdatenbank indizieren**

Öffne die Befehlspalette (`Cmd+P` / `Ctrl+P`) und führe **LLM Wiki German: Extrahierung starten** aus. Das Plugin durchsucht deinen Vault, sendet jede Notiz an das lokale Modell und baut eine strukturierte Wissensdatenbank auf. Der Fortschritt wird in der Statusleiste angezeigt.

> **Das dauert eine Weile.** Die erste Extrahierung verarbeitet jede Notiz einzeln, was schnell einige Stunden dauern kann.
> Nach dem ersten Durchlauf werden nur geänderte Notizen neu extrahiert — Updates dauern Sekunden, nicht Stunden.

**4. Stelle deinem Vault eine Frage**

Führe den Befehl **Wissensdatenbank abfragen** aus (oder klicke auf das Ribbon-Symbol). Gib eine Frage ein. Die Antworten werden gestreamt und enthalten klickbare Links zurück zu den Quellnotizen.

> **Tipp:** Lege einen Hotkey für schnellen Zugriff fest. Gehe zu Einstellungen → Hotkeys, suche nach „Wissensdatenbank abfragen" und weise eine Tastenkombination zu — `Alt+W` funktioniert gut.

Das war's. Du bist startklar.

![Abfrage](https://res.cloudinary.com/dbb1diepu/image/upload/v1784456952/aycs20x3qfsi2oymyzji.png)

## Was das Plugin kann

- **Extrahiert Wissen aus deinen Notizen** — Entitäten (Personen, Organisationen, Werkzeuge, Bücher, Orte, Ereignisse), Konzepte (Ideen, Theorien, Frameworks) und 9 Arten von Verbindungen zwischen ihnen.
- **Beantwortet Fragen in natürlicher Sprache** — ein Chat-Interface, das auf deinen eigenen Texten basiert, mit Quellenangaben, damit du jede Antwort überprüfen kannst.
- **Hybride Suche** — kombiniert Stichwortsuche, semantische Ähnlichkeit und Vault-Struktur, um den richtigen Kontext zu finden, selbst wenn deine Frage andere Wörter verwendet als deine Notizen.
- **Weiß, wenn es etwas nicht weiß** — wenn dein Vault nicht genug zu einem Thema enthält, sagt es das, anstatt etwas zu erfinden.
- **Generiert Wiki-Seiten** — strukturierte Markdown-Seiten für jede Entität, jedes Konzept und jede Quelle, organisiert in `wiki/`-Ordnern, kompatibel mit Obsidian [Bases](https://obsidian.md/bases).
- **Bleibt auf dem Laufenden** — das Speichern einer Notiz löst eine Hintergrund-Neuextraktion aus. Optionaler nächtlicher Voll-Durchlauf.
- **Mehrere Gesprächsrunden** — Chats werden gespeichert und sind fortsetzbar. Setze dort fort, wo du aufgehört hast.
- **Mehrere Anbieter** — Ollama (lokal, kostenlos) standardmäßig. OpenAI, Anthropic, Google und Mistral als Optionen.
- **Inhaltsverzeichnis** — in `wiki/index.md` sind alle Begriffe des Wikis aufgelistet und verlinkt.
  ![Index](https://res.cloudinary.com/dbb1diepu/image/upload/v1784391130/ene9ft4gllt4fl2wbdh8.png)

![Integritätsprüfung (Lint)](https://res.cloudinary.com/dbb1diepu/image/upload/v1784377558/nc2gvs16uwij9usxp13a.png)

| | |
|---|---|
| ![Abfrage-Modal](docs/assets/query-modal.png) | ![Chat-Antwort](docs/assets/chat-answer.png) |
| ![Quellen](docs/assets/chat-sources.png) | ![Einstellungen](https://res.cloudinary.com/dbb1diepu/image/upload/v1784389433/tiufxnvf8jhdur5rroaf.png) |

## Befehle

![Befehle](https://res.cloudinary.com/dbb1diepu/image/upload/v1784392095/txmwzs2cku5uazsytbk7.png)

| Befehl | Funktion |
|---|---|
| Wissensdatenbank abfragen | Öffnet das Chat-Modal |
| Extrahierung starten | Indiziert den gesamten Vault neu |
| aktuelle Datei extrahieren | Extrahiert nur die aktive Notiz neu |
| laufende Extrahierung abbrechen | Bricht eine laufende Extraktion ab |
| Seiten aus Wissensdatenbank neu generieren | Baut alle Wiki-Seiten neu auf |
| Wissensdatenbank von der Festplatte neu laden | Lädt die Wissensdatenbank ohne Neu-Extraktion |
| Wissensdatenbank aufräumen und prüfen | Führt eine Integritätsprüfung und Reparatur durch |

## Der `wiki/`-Ordner

LLM Wiki German trennt drei Dinge sauber:

- **Deine Notizen** — das Rohmaterial. LLM Wiki German liest sie, verändert sie aber nie.
- **Das Wiki** — eine strukturierte Wissensdatenbank im `wiki/`-Ordner, die aus deinen Notizen erstellt wird und für Abfragen durchsucht wird.
- **Deine Chats** — die Antworten des Plugins, gespeichert und fortsetzbar.

```
wiki/
  knowledge.json      Wissensdatenbank (strukturierte Daten)
  embeddings.json     Vektorcache für die semantische Suche
  index.md            Katalogseite (OKF-reserviert)
  log.md              Protokoll aller Extraktionen und Abfragen (OKF-reserviert)
  lint-report.md      Bericht der Integritätsprüfung (optional)
  entities/           eine Seite pro Entität
  concepts/           eine Seite pro Konzept
  sources/            eine Seite pro Quellnotiz
```

`index.md` und `log.md` sind OKF-reservierte Dateinamen, die von OKF-kompatiblen Werkzeugen erkannt werden.

Standardmäßig ist der `wiki/`-Ordner vor Suche, Quick Switcher und Graph-Ansicht versteckt. Falls du die generierten Seiten durchstöbern möchtest, kannst du sie unter Einstellungen → LLM Wiki German → Darstellung sichtbar machen.

## Cloud-Anbieter (optional)

Das Standard-Setup ist komplett lokal — keine Anmeldung, nichts zu bezahlen. Für größere Vaults oder schnellere Antworten kannst du unter Einstellungen → LLM Wiki German einen Cloud-Anbieter wählen und deinen API-Schlüssel eingeben.

| Anbieter | Chat-Modelle | Embedding |
|---|---|---|
| Ollama (Standard) | gemma4:e4b-it-qat u. a. | embeddinggemma |
| OpenAI | GPT-4o, GPT-4o mini, GPT-4.1, o3-mini | text-embedding-3-small / large |
| Anthropic | Claude Sonnet 4, Claude Haiku 4, Claude 3.5 Haiku | Ollama (embeddinggemma) |
| Google | Gemini 2.5 Flash, Gemini 2.0 Flash, Gemini 2.0 Flash Lite | text-embedding-004 |
| Mistral | Ministral 3B, Ministral 8B, Mistral Small | mistral-embed |
| LlamaCpp | Lokales Modell (z. B. gemma-4-E4B_q4_0-it) | Lokales Embedding-Modell |
| OpenAI-kompatibel | Eigenes Modell (z. B. über LM Studio, vLLM) | Eigenes Embedding-Modell |

> **Hinweis:** Anthropic hat keine eigene Embedding-API. Das Plugin nutzt dafür automatisch Ollama mit `embeddinggemma` als Fallback — Ollama muss also parallel laufen.

Cloud-Anbieter senden Notiz-Inhalte an die API des Anbieters. Wenn dir Privatsphäre wichtig ist, bleib bei Ollama.

## Datenschutz

- Mit Ollama (der Standardeinstellung) erfolgt die gesamte Verarbeitung auf deinem Rechner. Es wird nichts nach außen gesendet.
- Cloud-Anbieter erfordern das Senden von Notiz-Inhalten an deren APIs. Dies ist opt-in und in den Einstellungen klar gekennzeichnet.
- Keine Telemetrie, kein Analytics, kein Tracking irgendeiner Art.

## Wie es funktioniert

LLM Wiki German verwandelt deine unstrukturierten Notizen in eine strukturierte Wissensdatenbank und nutzt diese Struktur, um Fragen zu beantworten.

![LLM Wiki Workflow](https://res.cloudinary.com/dbb1diepu/image/upload/v1779641515/a3gf94cd7jqdj4matkpx.png)

**Extrahierung.** Das Plugin liest jede Notiz und sendet sie an ein LLM mit einem Prompt wie „welche Entitäten, Konzepte und Verbindungen sind in diesem Text?" Das Modell gibt strukturierte Daten zurück — Namen, Typen, Beschreibungen, Beziehungen — die in `wiki/knowledge.json` zusammengeführt werden.

**Seitengenerierung.** Aus der Wissensdatenbank schreibt das Plugin eine Markdown-Seite pro Entität, Konzept und Quellnotiz in den `wiki/`-Ordner. Diese Seiten folgen dem **Open Knowledge Format (OKF) v0.2**: strukturiertes Frontmatter mit `type`, `title`, `description`, `sources` (Provenienz), `generated` (Erzeuger) und `status` (Lebenszyklus) — damit sind die Wiki-Seiten nicht nur in Obsidian nutzbar, sondern auch für andere OKF-kompatible Werkzeuge portabel. Die Seiten sind einfaches Markdown mit Frontmatter und funktionieren mit Obsidians [Bases](https://obsidian.md/bases)-Funktion.

**Abruf.** Wenn du eine Frage stellst, sendet das Plugin nicht deinen gesamten Vault an das LLM. Es durchsucht die Wissensdatenbank mit drei Strategien parallel:

- *Stichwortsuche* (findet Einträge mit denselben Begriffen),
- *semantische Ähnlichkeit* (findet ähnliche Bedeutungen, auch mit anderen Wörtern — das macht `embeddinggemma`) und
- *Vault-Struktur* (bevorzugt Einträge aus Ordnern, die du ausgewählt hast).

Die Ergebnisse werden mit **Reciprocal Rank Fusion** zu einer kombinierten Rangliste zusammengeführt.

**Beantwortung.** Der am höchsten bewertete Kontext wird zusammen mit deiner Frage und dem Gesprächsverlauf in einen Prompt verpackt und an das LLM gesendet. Die Antwort wird Token für Token gestreamt und mit klickbaren Quellenlinks versehen.

**Auf dem Laufenden bleiben.** Wenn du eine Notiz speicherst, extrahiert das Plugin nur diese Datei im Hintergrund neu. Es gibt auch einen optionalen nächtlichen Planer für eine vollständige Aktualisierung.

**Integritätsprüfung (Lint).** Der Befehl „Wissensdatenbank aufräumen und prüfen" analysiert die Wissensdatenbank auf verwaiste Verbindungen, fehlende Quellen, doppelte Einträge und redundante Fakten. Für viele Probleme bietet das Plugin eine automatische Bereinigung an.

**Protokollierung.** Alle Extraktionen, Dateilöschungen und Abfragen werden in `wiki/log.md` protokolliert.
