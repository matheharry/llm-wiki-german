# Changelog

All notable changes to LLM Wiki are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

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
