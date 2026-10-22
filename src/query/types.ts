import type { Concept, Connection, Entity, SourceRecord } from "../core/types.js";

export type QueryType =
  | "entity_lookup"
  | "list_category"
  | "relational"
  | "conceptual";

export interface RankedItem {
  /** Stable ID — entity name slug or concept name slug. */
  id: string;
  /** Raw ranker score (interpretation depends on the ranker). */
  score: number;
}

export interface RetrievedBundle {
  question: string;
  queryType: QueryType;
  entities: Entity[];
  concepts: Concept[];
  connections: Connection[];
  sources: SourceRecord[];
  /**
   * Namen fuer die Anzeige: KB-ID -> lesbarer Name.
   *
   * Punkt 1b: `related`-Verweise und Verbindungen speichern IDs
   * ("schulmaterial"). Ohne diese Mappe erscheinen sie im Prompt als
   * Slug — das LLM kann "schulmaterial" keinem bekannten Begriff
   * zuordnen. Mit der Mappe steht dort "Schulmaterial".
   */
  nameById?: ReadonlyMap<string, string>;
}

export interface ScoredSource {
  id: string;
  score: number;
}

export interface AnswerEvent {
  kind: "context" | "chunk" | "done" | "error";
  bundle?: RetrievedBundle;
  text?: string;
  error?: string;
}
