import type { ChatTurn } from "../chat/types.js";
import type { KnowledgeBase } from "../core/kb.js";
import type { LLMProvider } from "../llm/provider.js";
import { formatContextMarkdown } from "./format-context.js";
import { buildAskPrompt } from "./prompts.js";
import { retrieve } from "./retrieve.js";
import { assessConfidence } from "./confidence.js";
import { randomEmptyMessage } from "./confidence.js";
import type { AnswerEvent } from "./types.js";

export interface AskArgs {
  question: string;
  /** If set, used for retrieval. Otherwise `question` is used. */
  retrievalQuery?: string;
  /** Prior turns rendered into the prompt as conversation context. */
  history?: readonly ChatTurn[];
  kb: KnowledgeBase;
  provider: LLMProvider;
  model: string;
  /** Model used to build the embedding index — needed for query embedding.
   * Falls back to `model` if not provided. */
  embeddingModel?: string;
  folders?: string[];
  embeddingIndex?: ReadonlyMap<string, number[]>;
  queryEmbedding?: number[] | null;
  signal?: AbortSignal;
}

async function computeQueryEmbedding(
  provider: LLMProvider,
  retrievalQuery: string,
  embeddingIndex: ReadonlyMap<string, number[]>,
  embeddingModel: string,
  signal?: AbortSignal,
): Promise<number[] | null> {
  if (!embeddingIndex || embeddingIndex.size === 0) return null;
  try {
    return await provider.embed({
      text: retrievalQuery,
      model: embeddingModel,
      signal,
    });
  } catch {
    return null;
  }
}

export async function* ask(args: AskArgs): AsyncIterable<AnswerEvent> {
  try {
    const question = args.retrievalQuery ?? args.question;

    // Compute the query embedding upfront so semantic retrieval can be
    // included in the very first retrieve call.  This is critical for
    // questions where the entity name is not a literal substring of the query.
    const queryEmbedding =
      args.queryEmbedding ??
      (await computeQueryEmbedding(
        args.provider,
        question,
        args.embeddingIndex ?? new Map(),
        args.embeddingModel ?? args.model,
        args.signal,
      ));

    let bundle = retrieve({
      question,
      kb: args.kb,
      folders: args.folders,
      embeddingIndex: args.embeddingIndex,
      queryEmbedding,
    });
    yield { kind: "context", bundle };

    // Short-circuit: if retrieval found nothing, skip the LLM call entirely.
    const confidence = assessConfidence(bundle);
    if (confidence === "empty") {
      yield {
        kind: "chunk",
        text: randomEmptyMessage(),
      };
      yield { kind: "done" };
      return;
    }

    const context = formatContextMarkdown(bundle);
    const prompt = buildAskPrompt({
      question: args.question,
      context,
      history: args.history,
    });

    // Send rules/instructions as a separate system message and the context/
    // question as the user message. This works correctly with Ollama /api/chat
    // (which applies the Modelfile system template separately) and with OpenAI-
    // style chat completions. For legacy /api/generate providers the system
    // text is simply prepended (see each provider's complete() implementation).
    for await (const chunk of args.provider.complete({
      prompt: prompt.user,
      system: prompt.system,
      model: args.model,
      signal: args.signal,
    })) {
      yield { kind: "chunk", text: chunk };
    }
    yield { kind: "done" };
  } catch (err) {
    yield {
      kind: "error",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
