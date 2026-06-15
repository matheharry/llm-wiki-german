import { OpenAIProvider } from "./openai.js";
import type { CompletionOptions, EmbedOptions, LLMProvider } from "./provider.js";

export interface LlamaCppProviderOptions {
  /** Base URL of the llama.cpp server; defaults to http://localhost:8080 */
  url?: string;
  /** Context window limit; defaults to 8192 */
  numCtx?: number;
  /** Custom fetch implementation for tests */
  fetchImpl?: typeof globalThis.fetch;
}

export class LlamaCppProvider implements LLMProvider {
  private readonly client: OpenAIProvider;
  private readonly numCtx: number;

  constructor(opts: LlamaCppProviderOptions = {}) {
    const baseUrl = opts.url ?? "http://localhost:8080";
    this.numCtx = opts.numCtx ?? 8192;
    this.client = new OpenAIProvider({
      apiKey: "",
      baseUrl,
      modelsEndpoint: "/v1/models",
      completionsEndpoint: "/v1/chat/completions",
      embeddingsEndpoint: "/v1/embeddings",
      fetchImpl: opts.fetchImpl,
    });
  }

  ping(signal?: AbortSignal): Promise<boolean> {
    return this.client.ping(signal);
  }

  listModels(): Promise<string[] | null> {
    return this.client.listModels();
  }

  showModel(_model: string): Promise<{ contextLength: number | null }> {
    return Promise.resolve({ contextLength: this.numCtx });
  }

  embed(opts: EmbedOptions): Promise<number[]> {
    return this.client.embed(opts);
  }

  complete(opts: CompletionOptions): AsyncIterable<string> {
    return this.client.complete(opts);
  }
}
