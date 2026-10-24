# Changelog

All notable changes to LLM Wiki are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [2.0.0] — 2026-10-24

### Added
- **Einstellbare Obergrenzen für den Abfragekontext**: Die Zahl der Entitäten,
  Konzepte und Verbindungen im Prompt war fest im Code verdrahtet, für Quellen
  gab es überhaupt keine Grenze. Alle vier Werte stehen jetzt im
  Einstellungs-Modal. Die Voreinstellungen für Entitäten, Konzepte und
  Verbindungen (8/5/20) entsprechen den bisherigen Konstanten; Quellen sind neu
  auf 30 gedeckelt (vorher unbegrenzt).
- **`scripts/regenerate-wiki.ts`**: erzeugt alle Wiki-Seiten direkt aus
  `wiki/knowledge.json`, ohne Obsidian und ohne einen einzigen LLM-Aufruf. Das
  Skript hat ein Sicherheitsnetz und bricht ab, wenn der Verzeichnis-Adapter
  leer zurückkommt — sonst würde der Aufräumschritt die gesamte Seitenablage
  löschen.
- **`updatedAt` im KB-Schema**: eigener Zeitstempel der letzten Änderung,
  getrennt vom Erstellungsdatum `generatedAt`. Bestehende Einträge werden beim
  Laden einmalig migriert (`updatedAt = generatedAt`).

### Changed
- **Versionssprung auf 2.0.0**: Das Verhalten beim Entfernen von Quellen, die
  Standard-Mindestdateigröße und das Frontmatter-Format haben sich geändert. Die
  Migration der Wissensbasis läuft beim Laden automatisch.
- **Gelöschte Quelldateien löschen kein Wissen mehr**: `removeSource()` entfernt
  nur noch die Zitation, nicht den Eintrag. Im Live-Wiki wären 69 belegte
  Wissensseiten und 64 Verweise darauf verschwunden, nur weil ihre Quelldatei
  gelöscht wurde. Verbindungen ohne verbleibende Quelle entfallen weiterhin.
- **Verwaiste Quellen-Records werden entfernt**: Zeigt ein KB-Quelleneintrag auf
  eine Datei, die es nicht mehr gibt, wird er samt Verweisen und den
  ausschließlich daran hängenden Verbindungen entfernt — vor der
  Seitengenerierung, damit betroffene Seiten ihre Quellenangabe verlieren statt
  neu geschrieben zu werden. Dateien, die existieren, aber außerhalb der
  indizierten Ordner liegen, bleiben unangetastet.
- **Standard-Mindestdateigröße 300 B**: Der Filter lief bisher mit 100 B, sodass
  winzige Notizen pro Nachtlauf LLM-Aufrufe kosteten, ohne einen verwertbaren
  Eintrag zu liefern; ein zweiter, hart kodierter 300er-Filter in `plugin.ts`
  war toter Code. Übersprungene Dateien werden jetzt im Log gezählt.
- **Frontmatter trennt `erstellt` und `aktualisiert`**: `aktualisiert` wurde
  bisher aus `generatedAt` gespeist und behauptete damit eine Aktualität, die es
  nicht gab (10.415 Einträge verteilten sich auf 35 Datumswerte, der älteste
  vom 2026-08-14).
- **Ein Log-Eintrag pro Extraktionslauf statt einer Zeile pro Datei**: Das
  Wiki-Log war auf 13.000 Zeilen / 1,9 MB gewachsen, davon rund 9.760 Zeilen
  "Inhalt unverändert" und nur etwa 15 Zeilen mit echtem Informationsgehalt.
  Einzelne Dateien erscheinen nur noch bei Fehlern; übersprungene Dateien und
  Qualitätsfilter werden nach Grund zusammengefasst.
- **Index-Seiten aufgeteilt und gestrafft**: Der Hauptindex gruppiert Konzepte
  alphabetisch und Entitäten nach Typ; die Quellen (zuvor rund 24 % der 2,7 MB)
  liegen im eigenen `wiki/quellen-index`.

### Fixed
- **Kontext-Explosion im Prompt**: Eine einzige Frage erzeugte 408 kB Kontext.
  Die Abschneidegrenze griff am Ende, und weil Entitäten zuerst kamen,
  verschlang dieser Abschnitt das Budget — alle Konzepte, Verbindungen und
  Quellen fielen stumm weg. Jetzt hat jeder Abschnitt sein eigenes Budget, wird
  für sich gekürzt und die Kürzung wird markiert. Ergebnis im Live-Wiki: 408.450 →
  14.829 Zeichen, alle vier Abschnitte im Prompt.
- **Quellen-Explosion im Kontext**: Das Bundle enthielt 659 Quellen, davon 469
  ohne eine einzige Fundstelle. Jetzt zuerst die Quellen der Fundstellen, dann
  die direkt getroffenen, gedeckelt bei 30 (−67 %).
- **Verbindungen mit Concept-Endpunkt waren unerreichbar**: `retrieve()`
  filterte nur über Entity-IDs; 1.053 der 5.620 Verbindungen hatten
  ausschließlich Concept-Endpunkte.
- **Entitäten ohne Quelle waren unerreichbar**: 21 Entitäten mit zusammen 60
  Fakten fehlten in Antworten, weil dieselbe Qualitätsprüfung wie für
  Wiki-Seiten griff. Neu trennt `isRetrievableEntity()` die beiden Fragen; der
  exakte Namensstreffer hat Vorrang, damit der Qualitätsmultiplikator die
  Relevanz nicht überstimmt. 19 von 19 Entitäten mit Fakten sind erreichbar
  (vorher 8).
- **`related` und Verbindungen als Slug im Prompt**: Nach der
  `related`-Migration enthalten die Felder IDs; im Prompt stand "schulmaterial"
  statt "Schulmaterial". Jetzt über `kb.nameMap()` aufgelöst.
- **Komposita-Splitter zerlegte Wörter falsch**: Der S-Joiner schnitt an jedem
  "s" ab und machte aus "Aggregatzustand" die Fragmente "aggregatzu" und
  "tand". Er greift nur noch, wenn beide Teile eigenständige Wörter sind.
- **Tote Links auf Quellseiten**: Jeder Eintrag, dessen `sources` die Quelle
  nannte, wurde verlinkt — auch die, die der Qualitätsfilter verworfen hatte
  (95 tote Links auf 1.003 Seiten). Einträge ohne Seite stehen jetzt als
  Klartext unter "Einträge (ohne Seite)".
- **Steuerzeichen machten Seiten ungültig**: `\b` aus LaTeX wird auf dem Weg
  durch den JSON-Transport zu einem echten Backspace und landete im
  Konzeptnamen — im Frontmatter und in der Überschrift. Das KB wird deshalb
  schon beim Laden bereinigt (`toStr`), für Namen, Definitionen, Aliasse,
  Quellen-Zusammenfassungen und Verbindungs-Beschreibungen. Tab, Zeilenumbruch
  und Wagenrücklauf bleiben erhalten.
- **`resolveAllRelated()` war nicht idempotent**: Nur `related` wurde aufgelöst,
  `unresolvedRelated` ignoriert. Beim zweiten Lauf verschwanden unaufgelöste
  Namen endgültig. Beide Hälften werden jetzt gemeinsam aufgelöst, sodass ein
  Verweis überlebt, bis sein Ziel existiert.
- **Doppelte Einträge und ungültiges YAML**: Gleichnamige Entitäten und Konzepte
  wurden mehrfach angelegt; `related`-Verweise zeigten auf Namen ohne Seite und
  Verbindungen auf nicht existierende Endpunkte. Die Erzeugung dedupliziert
  jetzt, löst Verweise nur auf gültige Seiten auf, filtert tote Verbindungen und
  härtet das YAML-Frontmatter.

## [1.2.0] — 2026-10-10

### Changed
- **Antwortzeiten bei großen Wissensbasen drastisch reduziert**: Die
  Abfrage-Pipeline hat für jeden gefundenen Treffer die gesamte Wissensbasis
  erneut linear durchsucht (quadratischer Aufwand in der Zahl der Datensätze).
  Diese Suche ist durch direkte Nachschlagetabellen ersetzt; außerdem werden
  Entitäten, Konzepte und Quellen einer Frage nur noch einmal aufbereitet,
  statt in jeder Ranking-Stufe neu. Auf einer Wissensbasis mit 16.000
  Datensätzen sank die Antwortzeit pro Frage von rund 15–22 s auf 0,05–0,16 s.
  Ein neuer Regressionstest hält das fest und schlägt fehl, sobald der
  quadratische Pfad zurückkehrt.
- **Vektor-Suche ohne doppelte Normberechnung**: Die Länge (L2-Norm) der
  Index-Vektoren wird beim Aufbau des Embedding-Index einmalig
  zwischengespeichert und die Norm der Suchanfrage nur einmal pro Frage
  berechnet, statt bei jedem Vergleich aufs Neue. Der Cache liegt nur im
  Arbeitsspeicher (eine Zahl pro Vektor); `embeddings-cache.json` behält sein
  bisheriges Format und lädt unverändert.
- **Nur echte Folgefragen werden umgeschrieben**: Elliptische oder
  pronomenbasierte Chat-Turns lösen eine LLM-Umschreibung aus, eigenständige
  Fragen gehen direkt an die Suche. Zusätzlich liefern feinere
  Abfrage-Typen, das Verwerfen schwacher Embedding-Treffer, priorisierte
  Fakten im Kontext sowie eine stärkere Gewichtung seltener Stichwörter und
  belastbarer Verbindungen passendere Antworten.
- **Slash-Filter ohne Fehlalarme**: Schuljahre, technische Abkürzungen und
  Begriffspaare werden nicht länger als Dateipfad interpretiert.
- **`wiki/log.md` wächst nicht mehr unbegrenzt**: Beim Schreiben des Logs
  werden Einträge entfernt, die älter als 30 Tage sind.

### Fixed
- **Seiten behalten ihr Erzeugungsdatum**: Entitäten und Konzepte erhalten ein
  stabiles `generatedAt` (ISO-Datum, `JJJJ-MM-TT`). Vorher wurde bei jeder
  Generierung das heutige Datum in `generated.at` und `aktualisiert`
  geschrieben, wodurch alle Seiten laufend neu erzeugt wurden. Bestehende
  Einträge werden beim Laden einmalig nachgetragen und danach unverändert
  übernommen; eine unveränderte Wissensbasis schreibt `generatePages` gar
  nicht mehr an.

## [1.1.2] — 2026-08-13

### Fixed
- **Restzeitanzeige bei Wiederaufnahme der Indizierung**: übersprungene Dateien
  (bereits in einer vorherigen Sitzung verarbeitet) verfälschen die berechnete
  Restzeit nicht mehr. Die Schätzung berücksichtigt jetzt nur echte Extraktionen
  (Dateien, bei denen ein LLM-Aufruf stattfand) für den Durchschnitt pro Datei.

### Changed
- **Linting entfernt verwaiste Links nicht mehr**: Die automatische Bereinigung
  von Verbindungen, deren Ausgangs- oder Zielpunkt nicht mehr existiert, wurde
  aus der Integritätsprüfung entfernt. Der Button "Ungültige Verbindungen
  entfernen" und die zugehörige Auto-Fix-Logik in der Lint-UI sind ebenfalls
  entfernt worden.

## [1.1.1] — 2026-08-09

## [1.0.1] — 2026-04-11

### Added
- **Mistral** as a built-in LLM provider. (#1, thanks @StefKors)
- **Multi-folder index**: pick one or more vault folders to include in the
  knowledge base. If none are picked, the whole vault is used.
  (#4, thanks @StefKors)
- **Custom OpenAI-compatible provider**: configure your own base URL, API
  key, and model to use any OpenAI-compatible endpoint. (#6, thanks @StefKors)
- **Extraction output language** setting, including Dutch.
  (#7, thanks @StefKors)
- Content-based extraction dedupe using SHA-256 hashes. Replaces the
  previous modification-time check, which could re-extract unchanged notes
  when iCloud touched file timestamps.

### Changed
- Extraction now respects the folder scope set for queries. Previously it
  ran against the whole vault regardless of your folder selection.
  (#5, thanks @StefKors)
- Multi-folder settings UI restyled to match Obsidian's native look.
- README: reframed features into three buckets and expanded the manual
  install instructions.

### Fixed
- Model/folder picker popover: clipping at screen edges, missing selection
  checkmark, long-name truncation, and toggle behavior.

## [1.0.0] — 2026-04-10

Initial public release.
