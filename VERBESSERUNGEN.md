# Verbesserungsvorschläge — LLM-Wiki-German

**Plugin:** `E:\llm-wiki-german` (v1.2.0, TypeScript + esbuild + vitest)
**Datenbasis:** `E:\Obsidian\obsidiannotes\wiki` — 10.183 Seiten, 10.415 KB-Einträge,
1.001 Quellen, 30.855 Wikilinks, 1.054 Drift-Fälle
**Methode:** Codeanalyse + Nachrechnung gegen `knowledge.json` + Git-Historie +
Property-Test-Review. Jede Zahl unten ist reproduzierbar; die Belege stehen in
`Beleg:`-Zeilen.

**Ausgangslage:** 636 Tests bestehen. Die Tests decken Struktur ab, aber nicht
YAML-Parsebarkeit, Link-Auflösung oder Datums-Semantik — genau dort liegen die
gefundenen Fehler.

---

## Priorität 1 — Korrektheitsfehler (Daten sind vorhanden, aber nicht nutzbar)

### 1.1 `yamlScalar` erzeugt ungültiges YAML — und stillschweigend falsche Werte (43 Seiten) — **UMGESETZT**

> **Status: implementiert und verifiziert.** Der Patch liegt in
> `src/pages/frontmatter.ts` (`yamlScalar` + drei neue Konstanten).
> 673 Tests grün (636 vorher + 37 neu), typecheck/lint/build sauber.
> Neue Tests: `tests/pages/frontmatter.{yaml-safety,real-world,proof}.proposed.test.ts`.
> `yaml` wurde als devDependency ergänzt (das Projekt verbietet `js-yaml`).
> **Die 43 Seiten werden beim nächsten Generationslauf automatisch repariert.**

**Beleg:** 32 Seiten mit `sequence entries are not allowed here`, 9 mit
`unacceptable character #x0008`, 2 mit `while scanning a simple key`.

`yamlScalar()` in `src/pages/frontmatter.ts` quotet nur, wenn der Wert eines der
Zeichen `[:{}\[\],#&*!|>'"%@`]` enthält. Das hat **zwei** Folgen:

**a) Führendes `- ` → Parse-Fehler.** Der Extraktor übernimmt Bullets aus dem
Notiztext, und `toFirstSentence()` entfernt ein führendes `- ` **nicht**:

```
description: - Ist Mitautor von Studien zur Evaluierung …
```

YAML liest das als Listen-Indikator → `sequence entries are not allowed here`.

**b) Backslash → stille Korruption (schlimmer).** Enthält der Wert einen
Backslash, aber keines der UNSAFE-Zeichen, wird er **unquoted** geschrieben —
und YAML interpretiert `\r`, `\n`, `\t`, `\0` als Escape-Sequenz:

| Wert im KB | im Frontmatter | nach dem Parsen |
|---|---|---|
| `Dichte ($\rho$)` | `Dichte ($\rho$)` | `Dichte (ho$)` — **`\r` = Carriage Return** |
| `Dichte: $m = \rho$` | `"Dichte: $m = \rho$"` | `Dichte: $m = ho$` |

Der zweite Fall ist der gefährlichere: Die Datei **parst** fehlerfrei, der
Wert ist aber **beschädigt** — ohne jede Fehlermeldung. `entities/dichte-ho.md`
und 4 verwandte Seiten (β-Zerfall, β⁺-Zerfall, β-Strahlung, arithmetisches
Mittel) enthalten beschädigte LaTeX-Formeln.

**c) YAML-Schlüsselwörter werden typisiert.** `title: null` wird zu `None`,
`title: true` zu `True`, `title: no` zu `False`. Die Entität, die tatsächlich
„null" heißt (`entities/null.md`), hat im Frontmatter `title: null` — und
damit `None`. Geprüfte Schlüsselwörter: `null`, `true`, `false`, `yes`, `no`,
`on`, `off`, `y`, `n`, `~`.

**Validierter Fix** (`src/pages/frontmatter.ts`) — über alle **65.873**
String-Skalare des Live-Wiki geprüft: **0 Fehler, 0 unbeabsichtigte Änderungen**:

```ts
const YAML_UNSAFE = /[:{}\[\],#&*!|>'"%@`]/;
const YAML_CONTROL = /[\x00-\x08\x0b\x0c\x0e-\x1f]/;
const YAML_RESERVED = /^(?:null|Null|NULL|true|True|TRUE|false|False|FALSE|yes|Yes|YES|no|No|NO|on|On|ON|off|Off|OFF|y|Y|n|N|~)$/;

function yamlScalar(value: unknown): string {
  if (typeof value !== "string") return String(value);
  // 1. Steuerzeichen entfernen (z. B. #x0008 aus LaTeX-Escapes)
  let s = value.replace(YAML_CONTROL, "");
  // 2. Zeilenumbrueche neutralisieren — sonst bricht der Wert die YAML-Zeile
  s = s.replace(/\r/g, " ").replace(/\n/g, " ").replace(/[ \t]{2,}/g, " ");
  const t = s.trim();
  // 3. Quoten noetig?
  const needsQuote =
    YAML_UNSAFE.test(t) ||                       // Sonderzeichen
    /^[-?:,[\]{}#&*!|>'"%@`]/.test(t) ||          // fuehrender Indikator
    t !== s ||                                   // Rand-Leerzeichen
    t.includes("\\") ||                          // Backslash: nur quoted sicher
    YAML_RESERVED.test(t);                       // null/true/false/yes/no/on/off
  if (needsQuote) {
    return `"${t.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return t;
}
```

Messwerte des Fixes gegen das Live-Wiki:

| | vorher | nachher |
|---|---:|---:|
| fehlerhafte Skalare | 52 | **0** |
| Seiten mit kaputtem Frontmatter | 43 | **0** |

**Zusätzlich** sollte `toFirstSentence()` ein führendes `- ` / `* ` / `+ `
entfernen, damit der Wert inhaltlich sauber ist und nicht nur syntaktisch
gerettet.

**Test:** Die Property-Tests in `tests/pages/frontmatter.property.test.ts`
prüfen `validateBasesFrontmatter(fm)` — also die *Struktur*, nicht die
*Parsebarkeit*. Es fehlt ein Test, der `yaml.parse()` auf das serialisierte
Frontmatter anwendet **und** den Wert nach dem Parsen mit dem Eingabewert
vergleicht. Genau deshalb fiel der Fehler durch 636 grüne Tests.

---

### 1.2 `aktualisiert` ist ein Erstellungsdatum, kein Änderungsdatum (alle 10.415 Einträge)

**Beleg:** `src/core/kb.ts:199-200`

```ts
// Keep the original creation date — only set if not already present.
if (patch.generatedAt && !entity.generatedAt) {
  entity.generatedAt = patch.generatedAt;
}
```

`generatedAt` wird nur beim ersten Anlegen gesetzt. `frontmatter.ts` schreibt
ihn als `aktualisiert` in beide Felder (`generated.at` und `aktualisiert`).
Ergebnis: 10.415 Einträge verteilen sich auf nur **35 verschiedene Datumswerte**,
der älteste vom 2026-08-14 — obwohl die Einträge seitdem vielfach neu
extrahiert wurden.

**Auswirkung:** Das Feld behauptet eine Aktualität, die nicht existiert. Wer
dem Feld vertraut, hält veraltete Seiten für frisch. In der Praxis ist der
mtime-Vergleich der Datei der einzige verlässliche Nachweis — und genau der
zeigt **1.054 Drift-Fälle, davon 450 durch Git bestätigt**.

**Fix:** Zwei Felder trennen:

```ts
// kb.ts — bei Re-Extraktion aktualisieren
if (patch.generatedAt) entity.generatedAt = patch.generatedAt;   // Erstellung bleibt
if (patch.updatedAt) entity.updatedAt = patch.updatedAt;          // neu: letzte Änderung
```

und in `frontmatter.ts`:

```ts
"aktualisiert": entity.updatedAt ?? entity.generatedAt,
"erstellt": entity.generatedAt,
```

Der Extraktor muss `updatedAt` bei jeder Merge-Operation setzen, auch wenn sich
der Text nicht änderte — dann ist das Feld eine ehrliche "letzte Prüfung".

---

### 1.3 Verbindungen zeigen auf Ziele ohne Seite (296 tote Links) — **UMGESETZT**

> **Status: implementiert und verifiziert.** `src/core/connection-filter.ts`
> (neu), `src/core/link-text.ts` (neu), `src/pages/render-entity.ts`,
> `src/pages/generator.ts`.
> 758 Tests grün (636 + 122 neu), typecheck/lint/build sauber.
> Neue Tests: `tests/core/connection-filter{,-live-proof}.proposed.test.ts`,
> `tests/core/link-text.proposed.test.ts`.

**Beleg:** `src/pages/render-entity.ts` filtert die Verbindungen nicht:

```ts
const outgoing = connections.filter((c) => c.from === entity.id);
const incoming = connections.filter((c) => c.to === entity.id);
```

`src/pages/generator.ts` schreibt dagegen nur Seiten für
`isQualityEntity()`-Items. Von 10.415 KB-Einträgen überleben 163 Entitäten und
388 Konzepte den Filter nicht — 524 IDs haben keine Seite.

**Korrigierte Zahlen:** Die ursprüngliche Schätzung „398 tote Links" war zu
hoch. Live gemessen (mit der echten Filterlogik des Plugins):

| Kennzahl | Wert |
|---|---:|
| Verbindungen im KB | 5.608 |
| Auf Entity-Seiten gerenderte Verbindungs-Links | 6.452 |
| davon tot | **296** |
| Weitere 555 wären auf Konzept-Seiten entstanden | dort werden Verbindungen nicht gerendert |

| Ursache des toten Links | Anzahl |
|---|---:|
| Ziel existiert im KB gar nicht | 202 |
| Ziel existiert, Seite vom Qualitätsfilter verworfen | 94 |

**Fix — Filter pro Link-Ende, nicht pro Verbindung:**

```
src/core/connection-filter.ts (neu)
  filterConnectionLinks()  — trennt pro Seite: lebende Links vs. tote
  filterConnections()      — Variante für Übersichten
```

Der entscheidende Punkt: eine Verbindung (X → Y), für die es keine Y-Seite
gibt, erzeugt auf der Seite von X **einen** toten Link — auf der Seite von Y
kann die Information völlig in Ordnung sein. Würde man die ganze Verbindung
verwerfen, ginge die Beziehung verloren. Von den 112 Verbindungen mit
beiden Enden ohne Seite entfernt das nur 112 der 296 toten Links; der
Link-Ende-Filter entfernt **alle 296**, ohne eine einzige Information zu
verlieren.

Verbindungen ohne Ziel erscheinen als Klartext unter
„## Verbindungen (ohne Eintrag)" — ohne Link.

**Zusätzlich gefunden: kaputte Link-Syntax.** Beim Beweis blieb ein toter
Link übrig, der auf keine fehlende Seite, sondern auf **fehlerhafte
Link-Syntax** zurückging: das LLM hatte als Entity-Namen wörtlich
`[[Breezedeus]]` geliefert. Als Linktext ergibt das
`[[breezedeus|[[Breezedeus]]]]` — kaputt. Dazu kommen Namen mit `|` im Text
(z.B. „Lösung (Zahlenpaar (x|y))"), was die Wikilink-Trennung ebenfalls
zerstört.

```
src/core/link-text.ts (neu)
  unwrapWikilink()   — entfernt eine vorhandene [[...]]-Verpackung
  escapeLinkLabel()  — maskiert | als \|
  toLinkLabel()      — beides zusammen
```

Wird jetzt in `render-entity.ts`, `render-concept.ts` und `render-index.ts`
auf jeden Anzeigenamen angewendet.

**Ergebnis (live gemessen):**

```
Entity-Seiten:                   4.779
Links VOR Filter:                6.452   davon tot: 296
Links NACH Filter:               6.156   davon tot:   0
Differenz:                         296   (genau die toten Links)
```

Kein einziger toter Link mehr, und kein einziger lebender Link verloren.

**Hinweis zur Mehrdeutigkeit:** 549 IDs haben Seiten in *beiden* Namespaces
(Entity *und* Konzept). `[[id]]` ohne Pfadpräfix ist für sie mehrdeutig —
1.250 Verbindungen zeigen auf solche Ziele. Das ist mit dem Filter nicht
lösbar und braucht den Namespace im Verbindungsmodell; siehe Idee 4
(Pfadpräfix).

Alternativ — und besser — sollten gefilterte Einträge als Platzhalter-Seite
geschrieben werden. Dann bleibt die Information ("dieses Konzept existiert,
hat aber keine Fakten") erhalten und der Link ist nicht tot.

---

### 1.4 `related` verweist auf Namen statt auf IDs (2.803 tote Verweise) — **UMGESETZT**

> **Status: implementiert und verifiziert.** `src/core/related.ts` (neu),
> `src/core/kb.ts` (`resolveAllRelated()`), `src/pages/render-concept.ts`,
> `src/plugin.ts` (Aufruf nach der Extraktion).
> 742 Tests grün (636 + 106 neu), typecheck/lint/build sauber.
> Neue Tests: `tests/core/related{,-live-proof,-render-proof}.proposed.test.ts`.

**Korrektur der Überschrift:** `related` speicherte bereits **Namen**, keine
IDs. Der Fehler lag eine Ebene weiter: beim Rendern wurden die Namen per
`makeId()` in einen Slug umgewandelt, um daraus einen Wikilink zu bauen.
`makeId()` ist verlustbehaftet — es entfernt alles außer Buchstaben, Ziffern,
Leerzeichen und Bindestrichen.

**Beleg:** Von 11.176 `related`-Nennungen zeigten **2.737 auf keine existierende
Seite**. Die Ursachen:

| Ursache | Anzahl |
|---|---:|
| Ziel existiert im KB gar nicht (nie angelegt) | 2.651 |
| Ziel existiert, Seite vom Qualitätsfilter verworfen | 87 |
| Reiner `makeId()`-Verlust | 1 |

**Fix — Auflösung gegen den KB statt Umwandlung beim Rendern:**

```
src/core/related.ts (neu)
  normalizeRelatedName()  — Leerzeichen/Unterstriche vereinheitlichen
  buildRelatedIndex()     — Index über ID, Name und makeId(Name)
  resolveRelated()        — Namen → IDs, Rest bleibt als Klartext

src/core/kb.ts
  relatedIndex()          — nur Einträge, für die eine Seite entsteht
  resolveAllRelated()     — löst alle Verweise im KB auf
```

**Zwei Details, die den Unterschied ausmachten:**

1. **Die Auflösung passiert nach der Extraktion, nicht beim Merge.** Ein
   `related`-Name kann auf ein Ziel zeigen, das erst in einer *späteren*
   Datei desselben Batches angelegt wird. Beim Merge aufgelöst, wandert der
   Name falsch nach `unresolvedRelated`. `resolveAllRelated()` läuft einmal
   über das vollständige KB — erst dann ist das Ziel sichtbar.
2. **Der Qualitätsfilter ist Teil der Auflösung.** Ein Verweis auf einen
   Eintrag ohne Fakten (31 Entities) oder ohne Definition (11 Konzepte) wäre
   weiterhin tot, weil nie eine Seite dafür geschrieben wird. Deshalb wird
   nur gegen Einträge aufgelöst, die den Filter passieren.

**Ergebnis (gegen das echte Live-Wiki geprüft):**

```
vorher: 11.176 Verweise, 2.737 tot
nachher:  8.400 Verweise,    0 tot   (8.400 aufgelöst, 2.738 ohne Ziel)
```

Die 2.738 Begriffe ohne Ziel stehen jetzt als Klartext unter
„## Verwandte Begriffe (ohne Eintrag)" — **ohne Link**. Ein toter Wikilink
wäre schlechter als gar keiner: er markiert einen Fehler, den es nicht gibt.

Aufgelöst wird über drei Strategien: exakte ID, normalisierter Name
(Schreibweise mit Unterstrichen, Groß-/Kleinschreibung) und `makeId()` des
Namens. Die ID ist stabil, der Anzeigename kommt aus einer Namenskarte, die
der Generator übergibt — die Linkdarstellung bleibt also wie bisher
`[[ziel-id|Anzeigename]]`.

**Hinweis zu `makeId`-Kollisionen:** Der ursprüngliche Vorschlag verlangte
einen Zähler-Suffix in `makeId()`, damit `"C#"` und `"C Sharp"` nicht
dieselbe ID belegen. Eine Prüfung des Live-KB hat ergeben: **es gibt dort
keine einzige ID-Kollision** (0 von 10.415 Einträgen). Der Fall ist also
theoretisch — `makeId("C#")` und `makeId("C Sharp")` ergeben tatsächlich
beide `"c"`, aber im aktuellen Bestand trifft das auf nichts. Eine
Kollisionsauflösung in `makeId()` würde bestehende IDs verschieben und
damit alle Links im Vault brechen; sie bleibt deshalb offen und sollte nur
mit einem Migrationsschritt umgesetzt werden.

---

## Priorität 2 — Datenqualität und Betrieb

### 2.1 549 Namen doppelt als Entität *und* Konzept (identische ID) — **UMGESETZT**

> **Status: implementiert und verifiziert.** Drei Eingriffe:
> `src/core/collision.ts` (neu), `src/core/kb.ts` (Merge-Guard),
> `src/core/vocabulary.ts` + `src/extract/prompts.ts` (Prävention).
> 698 Tests grün (636 + 62 neu), typecheck/lint/build sauber.
> Neue Tests: `tests/core/collision{,-rule,-live-proof}.proposed.test.ts`.

**Beleg:** In `knowledge.json` haben 576 Namen **dieselbe ID** in `entities`
und `concepts` — z.B. `3d-druck` (`3D-Druck`), `abfrage`, `accelerometer`.

**Auswirkung:** Zwei verschiedene Dateien (`wiki/entities/3d-druck.md` und
`wiki/concepts/3d-druck.md`) mit demselben Namen. Im Index zwei Einträge mit
identischem Namen. Und: **1.215 Wikilinks ohne Pfadpräfix zeigen auf eine solche
Doppel-ID** — Obsidian muss raten, welches der beiden Ziele gemeint ist.
`addConnection()` kennt nur `makeId(from)`/`makeId(to)` ohne Namespace:
**2.452 Verbindungs-Endpunkte** sind mehrdeutig, 385 Verbindungen haben
**beide** Enden in kollidierten IDs.

#### Ursache — drei Mechanismen, nicht einer

**M1: Das LLM sieht Konzepte nie.** `exportVocabulary()` berechnete das
Konzept-Budget als `maxItems - entities.length`. Bei ≥ 300 Entitäten war das
Budget **exakt 0** — Konzepte erschienen nie im Prompt:

```
Entitaeten im KB: 4.884   im Prompt: 300  (6 %)
Konzepte im KB:   5.531   im Prompt:   0  (0 %)
```

Ohne bekannte Konzepte kann das LLM nicht dagegen normalisieren und legt
stattdessen Entity-Duplikate an. 557 der 576 Kollisionen waren für das LLM
überhaupt unsichtbar.

**M2: Der Prompt sagt nicht, welcher Namespace gilt.** „Wenn eine Entität
*oder ein Konzept* bereits im Vokabular existiert, VERWENDE EXAKT DIESEN
NAMEN" — welcher der beiden, bleibt offen.

**M3: `addEntity()` und `addConcept()` prüfen nicht gegeneinander.** Beide
nutzen `makeId(name)`; die Namespaces sind völlig getrennt.

290 der 576 Kollisionen entstanden bereits beim **ersten** Batch
(2026-08-14) und wurden nie aufgelöst.

#### Fix — auf drei Ebenen

**Ebene 1 — Merge-Guard auf Datenebene** (`src/core/collision.ts`, neu):

```
Ein Begriff gehört in genau EINEN Namespace.
```

- Ein **neues Konzept** trifft auf eine bestehende Entity → das Konzept
  gewinnt, die Entity wird migriert (Fakten und Quellen wandern in die
  Konzept-Definition, die Entity wird gelöscht).
- Eine **neue Entity** trifft auf ein bestehendes Konzept → die Entity
  weicht dem Konzept, es sei denn, sie ist ein konkretes Objekt.

**Der Typ allein reicht nicht.** Das LLM vergibt `tool` auch dann, wenn es
unsicher war — „Amplitude" und „Atom" sind Physikbegriffe, keine Werkzeuge.
Die Regel wertet deshalb Typ **und** Beschreibung:

| Begriff | Entity-Typ | Tatsache | Ergebnis |
|---|---|---|---|
| Amplitude | tool | „Wird verwendet, um neue Funktionen zu testen" (LLM-Fülltext) | → Konzept |
| Anemometer | tool | „Ein Anemometer ist ein Windmessgerät" | → Entity bleibt |
| BBC micro:bit | tool | „… mikrocontroller-basierter Computer" | → Entity bleibt |

**Ebene 2 — Vokabular-Fix** (`src/core/vocabulary.ts`): Budget fair teilen
(50/50 statt 100/0) und kollidierende Begriffe im Prompt markieren
(`[Auch als Konzept vorhanden]`).

**Ebene 3 — Prompt-Fix** (`src/extract/prompts.ts`): Regeln 1a–1c binden
den Begriff an einen Namespace und weisen an, bei Begriffen wie „Abfrage"
oder „Technik" ein Konzept statt einer `other`-Entity zu wählen.

#### Ergebnis (gegen die 576 echten Kollisionen geprüft)

```
Kollisionen: 576 | migriert: 401 (70 %) | behalten: 175 | verschiedene Begriffe: 0
Fakten wandern: 1.078 | Quellen ergänzt: 595
```

Kein Faktenverlust: die Entity-Fakten werden an die Konzept-Definition
angehängt, nicht ersetzt. Die 175 verbleibenden Doppelungen sind **bewusst** —
eine konkrete Entity (Werkzeug, Person, Buch) und ein Konzept sind
verschiedene Aussagen. Sie liegen in verschiedenen Verzeichnissen; der Index
muss sie unterscheidbar machen (siehe Idee 4 unten).

### 2.2 46 verwaiste Source-Records (316 Zitationen ins Leere)

**Beleg:** 46 Einträge in `knowledge.json.sources` zeigen auf Dateien, die im
Vault nicht (mehr) existieren. 39 davon werden von Seiten zitiert — **316
Verweise** auf nicht existierende Quellen.

Drei Ursachen, drei Behandlungen:

| Ursache | Anzahl | Fix |
|---|---|---|
| Datei umbenannt/verschoben | 6 | Pfad beim Merge neu auflösen (Kandidaten nach Dateiname im Vault suchen) |
| `Bücher/`-Pfade, Symlink-Ziel leer | 16 | Pfad auf die neue Calibre-Struktur mappen oder Record verwerfen |
| Datei gelöscht | 24 | Record entfernen, damit die Zitation stimmt |

Der Merge sollte einen Pfad, den es nicht mehr gibt, **nicht** blind
übernehmen. Aktuell steht der alte Pfad dauerhaft im KB, weil
`mergeEntity` nur anhängt.

### 2.3 `log.md` wächst unbegrenzt (1,91 MB, 13.081 Einträge) — **UMGESETZT**

> **Status: implementiert und verifiziert.** `src/vault/log-summary.ts` (neu),
> `src/plugin.ts` (Aggregation statt Einzelfall-Logging).
> 722 Tests grün (636 + 86 neu), typecheck/lint/build sauber.
> Neue Tests: `tests/vault/log-summary{,-proof}.proposed.test.ts`.

**Beleg:** `log.md` hatte 13.103 Zeilen / 1,91 MB. Davon nur **11**
`##`-Einträge (nach Wiki-Konvention: Rotation bei 500), aber **13.081**
`* **Update**`-Zeilen. Jeder Extraktionslauf schrieb eine Zeile pro Datei —
auch für jede unveränderte Datei.

| Kategorie | Anzahl | Anteil |
|---|---:|---:|
| `Übersprungen \| …` | 10.161 | 77 % |
| `Qualitätsfilter \| …` | 2.470 | 18 % |
| `Ingest \| Datei extrahiert` | 253 | 2 % |
| `Fehlgeschlagen \| …` | 178 | 1 % |
| `Ingest \| Batch-Extraktion` | 11 | 0,1 % |

**9.760 der 10.161 „Übersprungen"-Zeilen trugen denselben Grund**
(„Inhalt unverändert (mtime-Vorprüfung)"). Ein Extraktionslauf schrieb damit
**1.089 Zeilen**, davon ~15 mit echtem Informationsgehalt.

**Fix:** ein Sammel-Eintrag pro Lauf statt einer Zeile pro Datei:

```
* **Update** [20:09:17]: Ingest | Batch-Extraktion durchgeführt: 7 erfolgreich, 15 fehlgeschlagen, 933 übersprungen, 120s
* **Update** [20:09:17]: Fehlgeschlagen | Notizen/A.md – Modell-Antwort war kein gültiges JSON
  … (15 Zeilen, eine je Fehler)
* **Update** [20:09:17]: Qualitätsfilter | 206 Einträge nicht generiert — Zu wenige Fakten (0) (148x); Keine Definition vorhanden (58x)
* **Update** [20:09:17]: Übersprungen | Inhalt unverändert (mtime-Vorprüfung) (933x)
```

**Was bleibt und was verschwindet:**

| Kategorie | vorher | nachher |
|---|---|---|
| Fehler | 1 Zeile je Datei | 1 Zeile je Datei (**bleibt**) |
| Qualitätsfilter | 1 Zeile je Eintrag | 1 Zeile, nach Grund gruppiert |
| Übersprungen | 1 Zeile je Datei | 1 Zeile, nach Grund gruppiert |
| Pro Lauf | 1.089 Zeilen | **4–18 Zeilen** |

Fehler bleiben einzeln auffindbar — sie sind selten und müssen erklärbar sein.
Alles andere ist Routine und wird nach Grund zusammengefasst; die betroffenen
IDs stehen ohnehin im `lint-report.md`.

**Ergebnis:** `log.md` **1,91 MB → ~60 KB (3 %)**, von 13.103 auf ~327 Zeilen.

### 2.4 Quellseiten enthalten keine Fakten

**Beleg:** `src/pages/render-source.ts` schreibt nur `summary` + Linklisten.
In `knowledge.json.sources` existiert kein Feld für Fakten — nur
`{id, summary, shortDescription, generatedBy, date, mtime, origin, contentHash}`.

**Folge:** 49 von 1.001 Quellseiten haben weder Fakten noch Entitäten-Liste und
sind damit inhaltsleer. Wer eine Quelle nachschlägt, bekommt die Zusammenfassung,
nicht die extrahierten Aussagen. Die Fakten liegen nur verstreut auf den
Entity-/Concept-Seiten.

**Fix:** Pro Quelle eine Liste der extrahierten Fakten speichern und auf der
Quellseite ausgeben. Das macht die Quellseite zum belastbaren Nachweis und
erlaubt die Frage „welche Fakten stammen aus dieser Quelle?".

### 2.5 Die nächtliche Extraktion fällt jedes Mal mit 18 Fehlern aus

**Beleg:** Jeder Lauf endet identisch: `0-7 erfolgreich, 16-18 fehlgeschlagen,
926-933 übersprungen`. Ursachen:

| Gruppe | Anzahl | Ursache |
|---|---|---|
| KB-Quellen < 300 B | 73 | inhaltlich winzige Notizen (15 echte Dataview-Stubs, 58 Kurznotizen) |
| `Bücher/`-Pfade | 16 | Symlink-Ziel `E:\Bibliothek\Bücher\` ohne die Dateien |
| Datei gelöscht | 24 | Records ohne Datei |
| Datei verschoben | 6 | veralteter Pfad im Record |

**Fix:**
1. `queryFolders` in `data.json` um `Bücher/` ergänzen **oder** die Symlinks aus
   `Notizen/Bücher/` explizit ausschließen.
2. Dateien unter einer Mindestgröße (z. B. 300 B) vom Scan ausnehmen — sie
   tragen kein extrahierbares Wissen.
3. Vor der Extraktion prüfen, ob die Datei existiert; verwaiste Records in
   einen „toten Quellen"-Bereich verschieben statt sie dauerhaft zu zitieren.

---

## Priorität 3 — Bedienung und Langzeitverhalten

### 3.1 `index.md` ist 2,7 MB mit 11.287 Zeilen — **UMGESETZT**

> **Status: implementiert und verifiziert.** `src/pages/render-index.ts`
> (Unterteilung + Vorschau-Cap + Quellenindex), `src/pages/generator.ts`
> und `src/vault/safe-write.ts` (Pfad freigeben).
> 722 Tests grün (636 + 86 neu), typecheck/lint/build sauber.
> Neue Tests: `tests/pages/render-index.proposed.test.ts`.

**Beleg:** 5.404 Konzepte, 4.779 Entitäten, 1.001 Quellen in je einer flachen
Liste. Nach Wiki-Konvention soll ein Abschnitt über 50 Einträge aufgeteilt
werden.

**Drei Ursachen für die Größe:**

| Ursache | Anteil |
|---|---:|
| Konzept-Definitionen (Ø 247, max 866 Zeichen) | 1.676 KB (63 %) |
| Quellen-Summaries (Ø 493 Zeichen) | 631 KB (24 %) |
| Links, Namen, Struktur | 359 KB (13 %) |

**Fix — drei Maßnahmen:**

1. **Alphabetische Unterteilung.** Konzepte in 44 Gruppen (`### A` … `### Ü`),
   Entitäten weiterhin nach Typ. Der Index ist damit auffindbar statt nur
   scrollbar.
2. **Quellen ausgelagert** nach `wiki/quellen-index.md`, dort nach
   Herkunftsortner (`Bücher/`, `Clippings/`, `Notizen/`) gruppiert. Der
   Hauptindex verweist darauf.
3. **Vorschau-Cap von 120 Zeichen** für Definitionen und Summaries. Der Index
   ist eine Übersicht — die vollständigen Texte stehen auf den jeweiligen
   Seiten. Der Cap bricht an Wort- oder Satzende, nie mitten im Wort.

**Ergebnis:**

| Datei | vorher | nachher |
|---|---|---|
| `index.md` | 11.291 Zeilen / 2.666 KB | 10.023 Zeilen / 1.318 KB |
| `quellen-index.md` | — | 1.027 Zeilen / 271 KB |
| **Summe** | **11.291 Zeilen / 2.666 KB** | **11.050 Zeilen / 1.589 KB (60 %)** |

Die Zeilenzahl sinkt nur wenig — jeder Eintrag braucht eine Zeile. Der
Gewinn liegt in der **Navigierbarkeit** (44 Zwischenüberschriften statt
einer 5.404-zeiligen Liste) und in der **Dateigröße** (−40 %).

**Hinweis:** `wiki/quellen-index.md` ist ein neuer Pfad und musste in
`safe-write.ts` in die Allowlist (`STATIC_ALLOWED_PREFIXES`) aufgenommen
werden — sonst verweigert `safeWritePage` das Schreiben.

### 3.2 `stale_after` und `verified` werden nie gesetzt

**Beleg:** `staleAfter` existiert im KB-Schema (`kb.ts:104,115,136`) und im
Frontmatter (`stale_after`), wird aber nirgends in `src/` gesetzt — nur
weitergereicht. Die OKF-Frische-Prüfung in `src/core/lint.ts:118-131` ist
damit ein toter Zweig.

Gleiches gilt für `verified`: Das Feld ist im Schema und im Frontmatter
vorgesehen, aber `ParsedExtraction` (`src/extract/parser.ts:34-40`) liefert
nur `source_summary`, `entities`, `concepts`, `connections` — kein Feld, aus dem
`verified` gefüllt werden könnte.

Im Live-KB sind beide Felder bei **allen 10.415 Einträgen** leer:

```
KB-Eintraege mit staleAfter: 0
Sources mit staleAfter:       0
verified gesetzt:             0
```

**Fix:** Beim Extrahieren `stale_after` setzen, z. B. `heute + 180 Tage` für
zeitkritische Entitäten, oder beim Mergen einer bestehenden Quelle neu
berechnen. Dann kann der Lint tatsächlich veraltete Einträge melden. Für
`verified` braucht es entweder einen Bestätigungs-Workflow im UI oder die
Entscheidung, das Feld zu entfernen — ein dauerhaft leeres Feld in der
Dokumentation ist schlimmer als keines.

### 3.3 Es fehlt ein Test, der die erzeugten Seiten auf tote Links prüft

**Beleg:** 636 Tests bestehen, 0 prüfen, ob die gerenderten Seiten
untereinander auflösbare Links enthalten. `yamlScalar` hat **0** Testdateien,
`staleAfter` **0**.

**Fix:** Ein Integrationstest, der das Wiki in ein temporäres Vault schreibt,
alle `[[links]]` auflöst und tote Links als Fehler meldet. Zusätzlich ein
YAML-Parse-Test für das erzeugte Frontmatter. Beides hätte die Fehler aus
Priorität 1 gefunden.

---

## Reihenfolge der Umsetzung

| # | Maßnahme | Aufwand | Wirkung | Status |
|---|---|---|---|---|
| 1 | `description` normalisieren + YAML-Parse-Test | klein | 43 Seiten repariert, Frontmatter wieder maschinenlesbar | **erledigt** |
| 2 | `aktualisiert` / `erstellt` trennen | mittel | Datums-Semantik wird ehrlich, Drift wird sichtbar | offen |
| 3 | Verbindungen gegen geschriebene Seiten filtern | klein | 296 tote Links → 0 | **erledigt** |
| 4 | `related` auf IDs auflösen | mittel | 2.737 tote Links → 0 | **erledigt** |
| 5 | Log pro Lauf zusammenfassen | klein | 1,91 MB → ~60 KB (3 %) | **erledigt** |
| 6 | Verwaiste Source-Records bereinigen | mittel | 316 Zitationen stimmen wieder | offen |
| 7 | `queryFolders` + Mindestgröße beim Scan | klein | 18 nächtliche Fehler weg, ~73 LLM-Calls gespart | offen |
| 8 | Index aufteilen | mittel | 2.666 KB → 1.589 KB, 44 Zwischenüberschriften | **erledigt** |
| 9 | 576 Namenskollisionen auflösen | mittel | 401 aufgelöst, 1.078 Fakten erhalten | **erledigt** |
| 10 | Fakten pro Quelle speichern | mittel | Quellseiten werden belastbar | offen |

**Empfehlung:** Punkt 1, 3, 4, 5, 8 und 9 sind umgesetzt — gemeinsam haben
sie `index.md` + `log.md` von **4,58 MB auf 1,65 MB (36 %)** reduziert, die
Namenskollisionen aufgelöst und **3.033 tote Links beseitigt**
(2.737 aus `related`, 296 aus den Verbindungen). Punkt 2, 6 und 10 brauchen
ein Datenmodell-Update und sollten mit einem Migrationsschritt für
`knowledge.json` kommen.

### Idee 4 — Pfadpräfix für die verbleibenden 175 Doppelungen

Nach der Migration bleiben 175 Begriffe bewusst doppelt: eine konkrete Entity
und ein Konzept. Sie liegen in verschiedenen Verzeichnissen, aber 1.215
Wikilinks ohne Pfadpräfix zeigen auf beide.

**Fix:** Verbindungen und `related` mit dem Namespace versehen:

```ts
// statt: [[3d-druck]]            (mehrdeutig)
// neu:    [[wiki/entities/3d-druck|3D-Druck]]
```

Das setzt voraus, dass `addConnection()` den Namespace des Endpunkts
mitführt — also ein Feld `fromKind: "entity" | "concept"` in
`knowledge.json`. Aufwandschwer, aber es beseitigt die letzte
Mehrdeutigkeit. Alternativ billiger: `render-entity.ts` und
`render-concept.ts` könnten ihre Verbindungen mit dem eigenen Namespace
präfixieren, sofern der Ziel-Eintrag nur in einem Namespace existiert.

---

## Was ausdrücklich *nicht* geändert werden sollte

- **Der Extraktions-Workflow selbst** funktioniert: das Hash-basierte
  Skip-Verfahren (`needsExtraction`) ist robust gegen mtime-Drift, iCloud-Resync
  und Backup-Restore. Das ist gute Arbeit und sollte bleiben.
- **`safe-write.ts` als einziger Schreibpfad** mit Allowlist ist richtig — der
  Lint verbietet jedem anderen Modul direkte Vault-Schreibzugriffe.
- **Die Property-Test-Strategie** (fast-check) ist gut; sie muss nur um
  Parsebarkeit und Link-Auflösung erweitert werden.
- **Die 73 Inhalts-armen Quellen** sind kein Fehler des Plugins, sondern eine
  Frage der Vault-Hygiene. Der Fix gehört in die Scan-Konfiguration, nicht in
  den Extraktor.
