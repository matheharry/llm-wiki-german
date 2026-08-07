import type { EmbeddingIndexState } from "../../query/embedding-index-controller.js";

export function formatIndexingStatus(state: EmbeddingIndexState): string {
  switch (state.kind) {
    case "idle":
      return "Vorbereitung…";
    case "building": {
      const { current, total } = state.progress;
      if (total === 0) return "Index wird aufgebaut…";
      return `Index wird aufgebaut… ${current} / ${total}`;
    }
    case "ready":
      return "Bereit";
    case "error":
      if (state.reason === "connect") {
        return "Ollama getrennt — zum Wiederholen klicken";
      }
      return `Embedding-Index nicht verfügbar (${state.message}) — Ausweichmodus nur mit Stichwörtern`;
  }
}
