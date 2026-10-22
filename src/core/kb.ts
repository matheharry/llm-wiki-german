import type {
  Concept,
  Connection,
  ConnectionType,
  Entity,
  EntityType,
  KBData,
  SourceOrigin,
  SourceRecord,
  VerifiedRecord,
} from "./types.js";
import { makeId } from "./ids.js";
import { resolveCrossNamespaceCollision } from "./collision.js";
import { buildRelatedIndex, resolveRelated } from "./related.js";
import { isQualityEntity, isQualityConcept } from "./filters.js";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function emptyKb(): KBData {
  const today = todayIso();
  return {
    meta: { version: 1, created: today, updated: today },
    entities: {},
    concepts: {},
    connections: [],
    sources: {},
  };
}

/** Coerce a raw JSON value to a trimmed string. */
function toStr(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

/** Coerce a raw JSON value to a string array. */
function toStrArr(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((item) => toStr(item)).filter((s) => s.length > 0);
}

/**
 * Sanitize KB data loaded from disk.  Older versions of the plugin or the
 * Python CLI could write non-string values (arrays, objects, numbers) for
 * string-typed fields.  This function coerces them to valid strings so the
 * rest of the codebase never sees e.g. `definition` as an array.
 */
function sanitizeKbData(raw: KBData): KBData {
  // Migration: legacy entries predating `generatedAt` get today's date so
  // their pages become stable from the next regeneration onward. Without
  // this, old entities/concepts would keep being rewritten with a fresh
  // date on every `generatePages` run.
  const today = todayIso();
  const concepts: Record<string, Concept> = {};
  for (const [id, c] of Object.entries(raw.concepts)) {
    concepts[id] = {
      id: c.id,
      name: toStr(c.name),
      definition: toStr(c.definition),
      shortDescription: c.shortDescription ? toStr(c.shortDescription) : undefined,
      generatedBy: c.generatedBy ? toStr(c.generatedBy) : undefined,
      generatedAt: c.generatedAt ? toStr(c.generatedAt) : today,
      // Legacy-Eintraege ohne `updatedAt`: der Erstellungszeitpunkt ist die
      // beste vorhandene Naeherung. Nach der naechsten Extraktion wird
      // das Feld fortgeschrieben.
      updatedAt: c.updatedAt ? toStr(c.updatedAt) : c.generatedAt ? toStr(c.generatedAt) : today,
      verified: c.verified,
      staleAfter: c.staleAfter ? toStr(c.staleAfter) : undefined,
      related: toStrArr(c.related),
      sources: toStrArr(c.sources),
    };
  }
  const entities: Record<string, Entity> = {};
  for (const [id, e] of Object.entries(raw.entities)) {
    entities[id] = {
      id: e.id,
      name: toStr(e.name),
      type: toStr(e.type) as EntityType,
      aliases: toStrArr(e.aliases),
      facts: toStrArr(e.facts),
      shortDescription: e.shortDescription ? toStr(e.shortDescription) : undefined,
      generatedBy: e.generatedBy ? toStr(e.generatedBy) : undefined,
      generatedAt: e.generatedAt ? toStr(e.generatedAt) : today,
      // Siehe `updatedAt` bei den Konzepten.
      updatedAt: e.updatedAt ? toStr(e.updatedAt) : e.generatedAt ? toStr(e.generatedAt) : today,
      verified: e.verified,
      staleAfter: e.staleAfter ? toStr(e.staleAfter) : undefined,
      sources: toStrArr(e.sources),
    };
  }
  const connections: Connection[] = raw.connections.map((c) => ({
    from: toStr(c.from),
    to: toStr(c.to),
    type: toStr(c.type) as ConnectionType,
    description: toStr(c.description),
    sources: toStrArr(c.sources),
  }));
  return { ...raw, concepts, entities, connections };
}

export interface AddEntityArgs {
  name: string;
  type: EntityType;
  aliases?: string[];
  facts?: string[];
  shortDescription?: string;
  generatedBy?: string;
  generatedAt?: string;
  updatedAt?: string;
  verified?: VerifiedRecord | VerifiedRecord[];
  staleAfter?: string;
  source?: string;
}

export interface AddConceptArgs {
  name: string;
  definition?: string;
  shortDescription?: string;
  generatedBy?: string;
  generatedAt?: string;
  updatedAt?: string;
  verified?: VerifiedRecord | VerifiedRecord[];
  staleAfter?: string;
  related?: string[];
  source?: string;
}

export interface AddConnectionArgs {
  from: string;
  to: string;
  type: ConnectionType;
  description?: string;
  source?: string;
}

export interface MarkSourceArgs {
  path: string;
  mtime: number;
  origin: SourceOrigin;
  summary?: string;
  shortDescription?: string;
  generatedBy?: string;
  verified?: VerifiedRecord | VerifiedRecord[];
  staleAfter?: string;
  date?: string;
  /** SHA-256 hex digest of the file's content at extraction time. */
  contentHash?: string;
}

export class KnowledgeBase {
  data: KBData;

  constructor(data?: KBData) {
    this.data = data ? sanitizeKbData(data) : emptyKb();
  }

  addEntity(args: AddEntityArgs): Entity {
    const id = makeId(args.name);

    // Namespace-Kollision: Ein Konzept mit demselben Begriff existiert
    // bereits. Dann keine parallele Entity anlegen, sondern den Inhalt
    // in das Konzept einfuehren.
    const existingConcept = this.data.concepts[id];
    if (existingConcept) {
      const decision = resolveCrossNamespaceCollision({
        newId: id,
        newName: args.name,
        newKind: "entity",
        newType: args.type,
        existingKind: "concept",
        existingId: id,
        existingName: existingConcept.name,
        existingText: existingConcept.definition ?? "",
        newText: (args.facts ?? []).join(" "),
      });
      if (decision.action === "merge" && decision.target === "concept") {
        this.mergeEntityIntoConcept(existingConcept, args);
        // Bewusst KEINE Entity gespeichert — der Begriff gehoert dem
        // Konzept. Zurueckgegeben wird die eingereichte Entity, damit
        // Aufrufer den Rueckgabewert weiterverwenden koennen. Ob sie
        // tatsaechlich gespeichert wurde, zeigt kb.getEntity(id).
        return {
          id,
          name: args.name,
          type: args.type,
          aliases: (args.aliases ?? []).filter((a) => a !== args.name),
          facts: args.facts ?? [],
          shortDescription: args.shortDescription,
          generatedBy: args.generatedBy,
          generatedAt: args.generatedAt,
          updatedAt: args.updatedAt,
          sources: args.source ? [args.source] : [],
        };
      }
    }

    const existing = this.data.entities[id];
    if (existing) {
      return this.mergeEntity(existing, {
        aliases: args.aliases,
        facts: args.facts,
        shortDescription: args.shortDescription,
        generatedBy: args.generatedBy,
        generatedAt: args.generatedAt,
        updatedAt: args.updatedAt,
        verified: args.verified,
        staleAfter: args.staleAfter,
        source: args.source,
      });
    }
    const entity: Entity = {
      id,
      name: args.name,
      type: args.type,
      aliases: (args.aliases ?? []).filter((a) => a !== args.name),
      facts: args.facts ?? [],
      shortDescription: args.shortDescription,
      generatedBy: args.generatedBy,
      generatedAt: args.generatedAt ?? todayIso(),
      updatedAt: args.updatedAt ?? todayIso(),
      verified: args.verified,
      staleAfter: args.staleAfter,
      sources: args.source ? [args.source] : [],
    };
    this.data.entities[id] = entity;
    return entity;
  }

  /**
   * Fuehrt den Inhalt einer Entity in ein bestehendes Konzept ein.
   *
   * Wird verwendet, wenn ein Begriff bereits als Konzept existiert und das
   * LLM ihn als Entity extrahiert. Das Konzept behaelt seine Identitaet.
   *
   * Das Konzept-Schema kennt kein `facts`-Feld, sondern nur `definition` und
   * `related`. Deshalb werden die Entity-Fakten an die Definition
   * angehaengt (bzw. ersetzen sie sie, wenn noch keine da ist) und
   * Aliasnamen wandern nach `related`.
   */
  private mergeEntityIntoConcept(concept: Concept, args: AddEntityArgs): void {
    if (args.shortDescription && !concept.shortDescription) {
      concept.shortDescription = args.shortDescription;
    }
    if (args.generatedBy) concept.generatedBy = args.generatedBy;
    if (args.generatedAt && !concept.generatedAt) {
      concept.generatedAt = args.generatedAt;
    }
    // Auch beim Merge in ein bestehendes Konzept zaehlt der heutige Lauf
    // als "zuletzt geprueft".
    concept.updatedAt = args.updatedAt ?? todayIso();

    const facts = (args.facts ?? []).map((f) => f.trim()).filter(Boolean);
    const definition = concept.definition.trim();

    if (!definition) {
      concept.definition = facts.join(" ");
    } else {
      const missing = facts.filter((f) => !definition.includes(f));
      if (missing.length > 0) {
        concept.definition = `${definition} ${missing.join(" ")}`.trim();
      }
    }

    for (const alias of args.aliases ?? []) {
      const trimmed = alias.trim();
      if (!trimmed) continue;
      if (trimmed !== concept.name && !concept.related.includes(trimmed)) {
        concept.related.push(trimmed);
      }
    }

    if (args.source && !concept.sources.includes(args.source)) {
      concept.sources.push(args.source);
    }
  }

  /**
   * Fuehrt den Inhalt eines Konzepts in eine bestehende Entity ein.
   *
   * Spiegelbild von mergeEntityIntoConcept: die Definition wird zum Fakt
   * (die Entity hat ein `facts`-Feld), die related-Namen werden zu Aliasen.
   */
  private mergeConceptIntoEntity(entity: Entity, args: AddConceptArgs): void {
    if (args.shortDescription && !entity.shortDescription) {
      entity.shortDescription = args.shortDescription;
    }
    if (args.generatedBy) entity.generatedBy = args.generatedBy;
    if (args.generatedAt && !entity.generatedAt) {
      entity.generatedAt = args.generatedAt;
    }
    // Auch beim Merge in eine bestehende Entity zaehlt der heutige Lauf
    // als "zuletzt geprueft".
    entity.updatedAt = args.updatedAt ?? todayIso();
    const definition = (args.definition ?? "").trim();
    if (definition && !entity.facts.includes(definition)) {
      entity.facts.push(definition);
    }
    // Namen verwandter Konzepte sind Verweise, keine Fakten -> Aliase.
    for (const related of args.related ?? []) {
      const trimmed = related.trim();
      if (!trimmed) continue;
      if (trimmed !== entity.name && !entity.aliases.includes(trimmed)) {
        entity.aliases.push(trimmed);
      }
    }
    if (args.source && !entity.sources.includes(args.source)) {
      entity.sources.push(args.source);
    }
  }

  /**
   * Migriert eine unklassifizierte "other"-Entity in ein Konzept.
   *
   * Wird verwendet, wenn das LLM einen Begriff zuerst als Entity
   * ("other"-Typ) extrahiert hat und spaeter als Konzept. Das Konzept hat
   * Vorrang, weil es eine Definition traegt; die Entity-Fakten und
   * -Quellen werden uebernommen, die Entity wird geloescht.
   */
  private migrateEntityToConcept(entity: Entity, args: AddConceptArgs): Concept {
    const concept: Concept = {
      id: entity.id,
      name: args.name,
      definition: (args.definition ?? "").trim(),
      shortDescription: args.shortDescription ?? entity.shortDescription,
      generatedBy: args.generatedBy ?? entity.generatedBy,
      generatedAt: entity.generatedAt ?? args.generatedAt,
      // Die Entity wird zum Konzept migriert — das ist ein frischer
      // Pruefzeitpunkt, also HEUTE. Das alte `updatedAt` der Entity
      // beschreibt einen anderen Zeitpunkt und darf nicht uebernommen
      // werden; das Erstellungsdatum bleibt erhalten.
      updatedAt: args.updatedAt ?? todayIso(),
      verified: entity.verified,
      staleAfter: entity.staleAfter,
      related: [...(args.related ?? [])],
      sources: [...entity.sources],
    };
    if (args.source && !concept.sources.includes(args.source)) {
      concept.sources.push(args.source);
    }
    const definition = concept.definition.trim();
    const missing = entity.facts
      .map((f) => f.trim())
      .filter((f) => f && !definition.includes(f));
    if (!definition && missing.length > 0) {
      concept.definition = missing.join(" ");
    } else if (missing.length > 0) {
      concept.definition = `${definition} ${missing.join(" ")}`.trim();
    }
    for (const alias of entity.aliases) {
      if (alias !== concept.name && !concept.related.includes(alias)) {
        concept.related.push(alias);
      }
    }
    // Die Entity wird entfernt — der Begriff gehoert jetzt dem Konzept.
    delete this.data.entities[entity.id];
    return concept;
  }

  private mergeEntity(
    entity: Entity,
    patch: {
      aliases?: string[];
      facts?: string[];
      shortDescription?: string;
      generatedBy?: string;
      generatedAt?: string;
      updatedAt?: string;
      verified?: VerifiedRecord | VerifiedRecord[];
      staleAfter?: string;
      source?: string;
    },
  ): Entity {
    if (patch.shortDescription && !entity.shortDescription) {
      entity.shortDescription = patch.shortDescription;
    }
    if (patch.generatedBy) entity.generatedBy = patch.generatedBy;
    // Keep the original creation date — only set if not already present.
    if (patch.generatedAt && !entity.generatedAt) {
      entity.generatedAt = patch.generatedAt;
    }
    // The creation date stays put; the last re-extraction is recorded
    // separately. Without this, `aktualisiert` in the page frontmatter
    // claimed a freshness that never existed.
    entity.updatedAt = patch.updatedAt ?? todayIso();
    if (patch.verified) entity.verified = patch.verified;
    if (patch.staleAfter) entity.staleAfter = patch.staleAfter;
    if (patch.aliases) {
      for (const a of patch.aliases) {
        if (a !== entity.name && !entity.aliases.includes(a)) {
          entity.aliases.push(a);
        }
      }
    }
    if (patch.facts) {
      const existingFacts = new Set(entity.facts);
      for (const f of patch.facts) {
        if (!existingFacts.has(f)) {
          entity.facts.push(f);
          existingFacts.add(f);
        }
      }
    }
    if (patch.source && !entity.sources.includes(patch.source)) {
      entity.sources.push(patch.source);
    }
    return entity;
  }

  addConcept(args: AddConceptArgs): Concept {
    const id = makeId(args.name);

    // Namespace-Kollision: Eine Entity mit demselben Begriff existiert
    // bereits. Dann kein paralleles Konzept anlegen.
    const existingEntity = this.data.entities[id];
    if (existingEntity) {
      const decision = resolveCrossNamespaceCollision({
        newId: id,
        newName: args.name,
        newKind: "concept",
        existingKind: "entity",
        existingId: id,
        existingName: existingEntity.name,
        existingType: existingEntity.type,
        existingText: existingEntity.facts.join(" "),
        newText: args.definition ?? "",
      });
      if (decision.action === "merge") {
        if (decision.target === "entity") {
          // Die Entity behaelt ihre Identitaet, das Konzept wird in sie
          // eingefuehrt und nicht gespeichert.
          this.mergeConceptIntoEntity(existingEntity, args);
          // Bewusst kein Konzept gespeichert. Zurueckgegeben wird das
          // eingereichte Konzept, damit Aufrufer den Rueckgabewert
          // weiterverwenden koennen. Ob es gespeichert wurde, zeigt
          // kb.getConcept(id).
          return {
            id,
            name: args.name,
            definition: args.definition ?? "",
            shortDescription: args.shortDescription,
            generatedBy: args.generatedBy,
            generatedAt: args.generatedAt,
            related: args.related ?? [],
            sources: args.source ? [args.source] : [],
          };
        }
        // target === "concept": das Konzept hat Vorrang. Die
        // unklassifizierte "other"-Entity wird migriert.
        const migrated = this.migrateEntityToConcept(existingEntity, args);
        this.data.concepts[id] = migrated;
        return migrated;
      }
    }

    const existing = this.data.concepts[id];
    if (existing) {
      return this.mergeConcept(existing, {
        definition: args.definition,
        shortDescription: args.shortDescription,
        generatedBy: args.generatedBy,
        generatedAt: args.generatedAt,
        updatedAt: args.updatedAt,
        verified: args.verified,
        staleAfter: args.staleAfter,
        related: args.related,
        source: args.source,
      });
    }
    const concept: Concept = {
      id,
      name: args.name,
      definition: args.definition ?? "",
      shortDescription: args.shortDescription,
      generatedBy: args.generatedBy,
      generatedAt: args.generatedAt ?? todayIso(),
      updatedAt: args.updatedAt ?? todayIso(),
      verified: args.verified,
      staleAfter: args.staleAfter,
      // `related` speichert die Namen so, wie das LLM sie geliefert hat.
      // Die Aufloesung zu IDs passiert spaeter in resolveAllRelated() —
      // erst dann ist das vollstaendige KB sichtbar und ein Name kann
      // auch auf ein Ziel zeigen, das erst spaeter angelegt wird.
      related: args.related ?? [],
      sources: args.source ? [args.source] : [],
    };
    this.data.concepts[id] = concept;
    return concept;
  }

  private mergeConcept(
    concept: Concept,
    patch: {
      definition?: string;
      shortDescription?: string;
      generatedBy?: string;
      generatedAt?: string;
      updatedAt?: string;
      verified?: VerifiedRecord | VerifiedRecord[];
      staleAfter?: string;
      related?: string[];
      source?: string;
    },
  ): Concept {
    if (patch.shortDescription && !concept.shortDescription) {
      concept.shortDescription = patch.shortDescription;
    }
    if (patch.generatedBy) concept.generatedBy = patch.generatedBy;
    // Keep the original creation date — only set if not already present.
    if (patch.generatedAt && !concept.generatedAt) {
      concept.generatedAt = patch.generatedAt;
    }
    // The creation date stays put; the last re-extraction is recorded
    // separately. Without this, `aktualisiert` in the page frontmatter
    // claimed a freshness that never existed.
    concept.updatedAt = patch.updatedAt ?? todayIso();
    if (patch.verified) concept.verified = patch.verified;
    if (patch.staleAfter) concept.staleAfter = patch.staleAfter;
    if (patch.definition && patch.definition.length > concept.definition.length) {
      concept.definition = patch.definition;
    }
    if (patch.related) {
      // Namen unveraendert uebernehmen — die Aufloesung passiert
      // spaeter in resolveAllRelated().
      const existing = new Set(concept.related);
      for (const r of patch.related) {
        if (!existing.has(r)) {
          concept.related.push(r);
          existing.add(r);
        }
      }
    }
    if (patch.source && !concept.sources.includes(patch.source)) {
      concept.sources.push(patch.source);
    }
    return concept;
  }

  /**
   * Index aller bekannten Entity- und Concept-IDs, gegen den
   * `related`-Namen aufgeloest werden.
   */
  relatedIndex(): Map<string, string> {
    // Nur Einträge, für die tatsächlich eine Seite geschrieben wird. Ein
    // Verweis auf einen vom Qualitätsfilter verworfenen Eintrag wäre
    // weiterhin ein toter Link.
    return buildRelatedIndex([
      ...Object.values(this.data.entities)
        .filter((e) => isQualityEntity(e))
        .map((e) => ({ id: e.id, name: e.name })),
      ...Object.values(this.data.concepts)
        .filter((c) => isQualityConcept(c))
        .map((c) => ({ id: c.id, name: c.name })),
    ]);
  }

  /**
   * Loest alle `related`-Verweise im gesamten KB auf.
   *
   * Wird nach der Extraktion einmal ueber alle Eintraege gelaufen, damit
   * auch Verweise aufgeloest werden, deren Ziel erst in einer spaeteren
   * Datei desselben Batches angelegt wurde.
   *
   * Nach dem Durchlauf enthaelt `concept.related` die KB-IDs der
   * aufgeloesten Verweise; Namen ohne Ziel stehen in
   * `concept.unresolvedRelated`.
   *
   * @returns Anzahl der aufgeloesten und der unaufgeloesten Verweise
   */
  resolveAllRelated(): { resolved: number; unresolved: number } {
    const index = this.relatedIndex();
    let resolvedCount = 0;
    let unresolvedCount = 0;

    // Nur Konzepte fuehren ein `related`-Feld.
    for (const concept of Object.values(this.data.concepts)) {
      const names = concept.related ?? [];
      if (names.length === 0) continue;

      const { resolved, unresolved } = resolveRelated(names, index);
      resolvedCount += resolved.length;
      unresolvedCount += unresolved.length;

      // Bereits aufgeloeste IDs (aus einem frueheren Lauf) mitnehmen.
      const merged: string[] = [];
      const seen = new Set<string>();
      for (const id of resolved) {
        if (!seen.has(id)) {
          seen.add(id);
          merged.push(id);
        }
      }
      concept.related = merged;
      concept.unresolvedRelated = unresolved;
    }

    return { resolved: resolvedCount, unresolved: unresolvedCount };
  }

  addConnection(args: AddConnectionArgs): Connection {
    const fromId = makeId(args.from);
    const toId = makeId(args.to);
    const existing = this.data.connections.find(
      (c) => c.from === fromId && c.to === toId && c.type === args.type,
    );
    if (existing) {
      if (args.source && !existing.sources.includes(args.source)) {
        existing.sources.push(args.source);
      }
      return existing;
    }
    const connection: Connection = {
      from: fromId,
      to: toId,
      type: args.type,
      description: args.description ?? "",
      sources: args.source ? [args.source] : [],
    };
    this.data.connections.push(connection);
    return connection;
  }

  markSource(args: MarkSourceArgs): void {
    const record: SourceRecord = {
      id: args.path,
      summary: args.summary ?? "",
      shortDescription: args.shortDescription,
      generatedBy: args.generatedBy,
      verified: args.verified,
      staleAfter: args.staleAfter,
      date: args.date ?? todayIso(),
      mtime: args.mtime,
      origin: args.origin,
    };
    if (args.contentHash !== undefined) {
      record.contentHash = args.contentHash;
    }
    this.data.sources[args.path] = record;
  }

  /**
   * Entfernt Source-Records, deren Datei im Vault nicht mehr existiert.
   *
   * Hintergrund: Das KB behaelt Source-Records fuer Dateien, die es im
   * Vault nicht (mehr) gibt. Im Live-Vault waren das 46 Records:
   *   - 24 geloeschte Dateien (Clippings/, Notizen/)
   *   - 16 `Buecher/`-Pfade, deren Symlink-Ziel (`E:\Bibliothek\Buecher\`)
   *     die Datei nicht mehr enthaelt
   *   - 6 umbenannte/verschobene Dateien
   *
   * Solche Records sind nicht nur Schmutz: Jede Wiki-Seite, die auf
   * einen solchen Record verweist, zitiert eine Quelle, die es nicht
   * gibt. Der Link im Frontmatter zeigt ins Leere.
   *
   * WICHTIG — der Aufrufer entscheidet, was "nicht existiert" heisst:
   * diese Methode bekommt die Liste der VERWAISTEN Pfade, nicht den
   * Vault. Grund: der Extraktionslauf kennt nur die Dateien im
   * Query-Scope. Eine Datei ausserhalb des Scopes (z.B. `Buecher/`)
   * ist nicht "verwaist", sondern "nicht gescannt" — sie darf NICHT
   * entfernt werden.
   *
   * @param orphanedPaths Pfade, die nachweislich nicht mehr existieren.
   * @returns Die Anzahl der entfernten Records.
   */
  removeOrphanedSources(orphanedPaths: Iterable<string>): number {
    let removed = 0;
    for (const path of orphanedPaths) {
      if (!this.data.sources[path]) continue;
      this.removeSource(path);
      removed++;
    }
    return removed;
  }

  /**
   * Fast pre-check by mtime: if a stored record has a contentHash and current mtime <= stored mtime,
   * we can skip reading the file and computing SHA-256 altogether.
   */
  needsExtractionFast(path: string, currentMtime: number): boolean {
    const stored = this.data.sources[path];
    if (!stored) return true;
    if (stored.contentHash !== undefined && currentMtime <= stored.mtime) {
      return false;
    }
    return true;
  }

  /**
   * Decides whether a file needs (re-)extraction.
   *
   * The primary signal is the content hash: if the stored record has a
   * `contentHash` and it matches the current file's hash, the file is
   * identical to what we last extracted and we skip it. This is immune
   * to mtime drift from iCloud re-sync, backup restores, vault moves,
   * clock skew, and cross-tool unit mismatches (seconds vs milliseconds).
   *
   * The secondary signal, used only for pre-migration entries that lack
   * a stored hash, is the mtime comparison we used before hash-based
   * dedupe shipped. Those entries get their hash backfilled on skip
   * (see `backfillContentHash`), so after one successful run every
   * source has a hash and the fallback path is never taken again.
   */
  needsExtraction(
    path: string,
    currentMtime: number,
    currentContentHash: string,
  ): boolean {
    const stored = this.data.sources[path];
    if (!stored) return true;
    if (stored.contentHash !== undefined) {
      return currentContentHash !== stored.contentHash;
    }
    // Pre-migration entry: no stored hash, fall back to mtime.
    return currentMtime > stored.mtime;
  }

  /**
   * Populates or updates `contentHash` on an existing source without
   * touching `summary`, `date`, or `origin`. Called by the extraction
   * queue when a file is skipped as up-to-date — the queue has just
   * computed the file's hash and we want to cache it so future runs
   * use the hash path instead of the mtime fallback.
   *
   * No-op if the source does not exist.
   */
  backfillContentHash(path: string, contentHash: string, mtime: number): void {
    const stored = this.data.sources[path];
    if (!stored) return;
    stored.contentHash = contentHash;
    // Upgrade stored mtime to match the current on-disk value, so a
    // future mtime-based comparison (e.g. from an older tool) does not
    // spuriously flag this file as needing re-extraction.
    stored.mtime = mtime;
  }

  isProcessed(path: string): boolean {
    return path in this.data.sources;
  }

  allEntities(): Entity[] {
    return Object.values(this.data.entities);
  }

  allConcepts(): Concept[] {
    return Object.values(this.data.concepts);
  }

  allConnections(): Connection[] {
    return this.data.connections;
  }

  allSources(): SourceRecord[] {
    return Object.values(this.data.sources);
  }

  getEntity(nameOrId: string): Entity | undefined {
    const id = makeId(nameOrId);
    if (this.data.entities[id]) return this.data.entities[id];
    const lower = nameOrId.toLowerCase();
    for (const e of Object.values(this.data.entities)) {
      if (e.aliases.some((a) => a.toLowerCase() === lower)) {
        return e;
      }
    }
    return undefined;
  }

  getConcept(nameOrId: string): Concept | undefined {
    const id = makeId(nameOrId);
    return this.data.concepts[id];
  }

  removeSource(path: string): void {
    delete this.data.sources[path];
    for (const [id, entity] of Object.entries(this.data.entities)) {
      entity.sources = entity.sources.filter((s) => s !== path);
      if (entity.sources.length === 0) delete this.data.entities[id];
    }
    for (const [id, concept] of Object.entries(this.data.concepts)) {
      concept.sources = concept.sources.filter((s) => s !== path);
      if (concept.sources.length === 0) delete this.data.concepts[id];
    }
    this.data.connections = this.data.connections.filter((conn) => {
      conn.sources = conn.sources.filter((s) => s !== path);
      return conn.sources.length > 0;
    });
  }

  renameSource(oldPath: string, newPath: string): void {
    const source = this.data.sources[oldPath];
    if (!source) return;
    delete this.data.sources[oldPath];
    source.id = newPath;
    this.data.sources[newPath] = source;
    for (const entity of Object.values(this.data.entities)) {
      entity.sources = entity.sources.map((s) => (s === oldPath ? newPath : s));
    }
    for (const concept of Object.values(this.data.concepts)) {
      concept.sources = concept.sources.map((s) =>
        s === oldPath ? newPath : s,
      );
    }
    for (const conn of this.data.connections) {
      conn.sources = conn.sources.map((s) => (s === oldPath ? newPath : s));
    }
  }

  connectionsFor(nameOrId: string): Connection[] {
    const id = makeId(nameOrId);
    return this.data.connections.filter(
      (c) => c.from === id || c.to === id,
    );
  }

  stats(): {
    entities: number;
    concepts: number;
    connections: number;
    sources: number;
  } {
    return {
      entities: Object.keys(this.data.entities).length,
      concepts: Object.keys(this.data.concepts).length,
      connections: this.data.connections.length,
      sources: Object.keys(this.data.sources).length,
    };
  }
}
