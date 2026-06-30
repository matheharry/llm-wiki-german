import type { KnowledgeBase } from "./kb.js";
import { isQualityEntity, isQualityConcept } from "./filters.js";

export interface LintIssue {
  severity: "error" | "warning" | "info";
  category: "Verbindungen" | "Qualität" | "Quellen" | "Blacklist" | "Duplikate";
  message: string;
  detail: string;
}

export interface LintResult {
  issues: LintIssue[];
  stats: {
    totalEntities: number;
    qualityEntities: number;
    totalConcepts: number;
    qualityConcepts: number;
    totalConnections: number;
    totalSources: number;
  };
}

export function runLint(kb: KnowledgeBase): LintResult {
  const issues: LintIssue[] = [];

  const entities = kb.allEntities();
  const concepts = kb.allConcepts();
  const connections = kb.allConnections();
  const sources = kb.allSources();

  const entityMap = new Map(entities.map((e) => [e.id, e]));
  const conceptMap = new Map(concepts.map((c) => [c.id, c]));
  const sourceMap = new Map(sources.map((s) => [s.id, s]));

  // Helper to check if an ID exists as either entity or concept
  const exists = (id: string) => entityMap.has(id) || conceptMap.has(id);

  // 1. Dangling Connections
  for (const conn of connections) {
    if (!exists(conn.from)) {
      issues.push({
        severity: "error",
        category: "Verbindungen",
        message: `Ungültiger Ausgangspunkt in Verbindung`,
        detail: `Verbindung verweist von ID "${conn.from}" (nicht vorhanden) nach "${conn.to}" (${conn.type}).`,
      });
    }
    if (!exists(conn.to)) {
      issues.push({
        severity: "error",
        category: "Verbindungen",
        message: `Ungültiges Ziel in Verbindung`,
        detail: `Verbindung verweist von "${conn.from}" nach ID "${conn.to}" (nicht vorhanden) (${conn.type}).`,
      });
    }
  }

  // 2. Missing Sources
  for (const ent of entities) {
    for (const srcPath of ent.sources) {
      if (!sourceMap.has(srcPath)) {
        issues.push({
          severity: "warning",
          category: "Quellen",
          message: `Fehlende Quelle bei Entität`,
          detail: `Entität "${ent.name}" (${ent.id}) verweist auf Quelle "${srcPath}", die nicht in der Quellenliste existiert.`,
        });
      }
    }
  }
  for (const con of concepts) {
    for (const srcPath of con.sources) {
      if (!sourceMap.has(srcPath)) {
        issues.push({
          severity: "warning",
          category: "Quellen",
          message: `Fehlende Quelle bei Konzept`,
          detail: `Konzept "${con.name}" (${con.id}) verweist auf Quelle "${srcPath}", die nicht in der Quellenliste existiert.`,
        });
      }
    }
  }

  // 3. Low Quality Items
  let qualityEntitiesCount = 0;
  for (const ent of entities) {
    if (isQualityEntity(ent)) {
      qualityEntitiesCount++;
    } else {
      issues.push({
        severity: "info",
        category: "Qualität",
        message: `Entität hat unzureichende Qualität`,
        detail: `Entität "${ent.name}" (${ent.id}) wird nicht generiert, da sie weniger als 1 Fakt oder 1 Quelle besitzt (${ent.facts.length} Fakten, ${ent.sources.length} Quellen).`,
      });
    }
  }

  let qualityConceptsCount = 0;
  for (const con of concepts) {
    if (isQualityConcept(con)) {
      qualityConceptsCount++;
    } else {
      issues.push({
        severity: "info",
        category: "Qualität",
        message: `Konzept hat unzureichende Qualität`,
        detail: `Konzept "${con.name}" (${con.id}) hat keine Definition oder ist leer und wird daher nicht generiert.`,
      });
    }
  }

  // 4. Duplicate Check (Case Insensitive Names)
  const nameToId = new Map<string, string>();
  for (const ent of entities) {
    const norm = ent.name.toLowerCase().trim();
    if (nameToId.has(norm) && nameToId.get(norm) !== ent.id) {
      issues.push({
        severity: "warning",
        category: "Duplikate",
        message: `Mögliche doppelte Entität`,
        detail: `Entität "${ent.name}" (${ent.id}) hat einen fast identischen Namen wie Entität mit ID "${nameToId.get(norm)}".`,
      });
    } else {
      nameToId.set(norm, ent.id);
    }
  }

  for (const con of concepts) {
    const norm = con.name.toLowerCase().trim();
    if (nameToId.has(norm) && nameToId.get(norm) !== con.id) {
      issues.push({
        severity: "warning",
        category: "Duplikate",
        message: `Mögliches doppeltes Konzept`,
        detail: `Konzept "${con.name}" (${con.id}) teilt den Namen mit einem anderen Eintrag mit ID "${nameToId.get(norm)}".`,
      });
    } else {
      nameToId.set(norm, con.id);
    }
  }

  return {
    issues,
    stats: {
      totalEntities: entities.length,
      qualityEntities: qualityEntitiesCount,
      totalConcepts: concepts.length,
      qualityConcepts: qualityConceptsCount,
      totalConnections: connections.length,
      totalSources: sources.length,
    },
  };
}
