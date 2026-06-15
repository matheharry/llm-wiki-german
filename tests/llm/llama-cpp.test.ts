import { LLMHttpError } from "../../src/llm/provider.js";
import { describe, expect, it } from "vitest";

import { LlamaCppProvider } from "../../src/llm/llama-cpp.js";
import { createMockFetch } from "../helpers/mock-fetch.js";

function sseChunk(content: string): string {
  return `data: ${JSON.stringify({
    choices: [{ delta: { content }, finish_reason: null }],
  })}\n\n`;
}

const SSE_DONE = "data: [DONE]\n\n";

describe("LlamaCppProvider.complete", () => {
  it("streams tokens from llama.cpp /v1/chat/completions", async () => {
    const mock = createMockFetch([
      {
        chunks: [sseChunk("Hello"), sseChunk(" llama"), SSE_DONE],
      },
    ]);
    const provider = new LlamaCppProvider({
      url: "http://localhost:8080",
      fetchImpl: mock.fetch,
    });

    const tokens: string[] = [];
    for await (const chunk of provider.complete({
      prompt: "hi",
      model: "llama-cpp-model",
    })) {
      tokens.push(chunk);
    }

    expect(tokens.join("")).toBe("Hello llama");
    expect(mock.calls).toHaveLength(1);
    expect(mock.calls[0].url).toBe(
      "http://localhost:8080/v1/chat/completions",
    );
    const body = JSON.parse(mock.calls[0].body!);
    expect(body.model).toBe("llama-cpp-model");
    expect(body.stream).toBe(true);
    expect(body.messages[0].content).toBe("hi");
  });

  it("throws LLMHttpError on non-200", async () => {
    const mock = createMockFetch([{ status: 500, body: "Internal Server Error" }]);
    const provider = new LlamaCppProvider({
      fetchImpl: mock.fetch,
    });
    await expect(async () => {
      for await (const _ of provider.complete({
        prompt: "hi",
        model: "llama-cpp-model",
      })) {
        // consume
      }
    }).rejects.toThrow(LLMHttpError);
  });
});

describe("LlamaCppProvider.embed", () => {
  it("returns embedding vector from llama.cpp /v1/embeddings", async () => {
    const mock = createMockFetch([
      {
        body: JSON.stringify({
          data: [{ embedding: [0.5, 0.6, 0.7] }],
        }),
      },
    ]);
    const provider = new LlamaCppProvider({
      fetchImpl: mock.fetch,
    });

    const vec = await provider.embed({
      text: "hello",
      model: "llama-cpp-model",
    });
    expect(vec).toEqual([0.5, 0.6, 0.7]);
    expect(mock.calls[0].url).toBe(
      "http://localhost:8080/v1/embeddings",
    );
  });
});

describe("LlamaCppProvider.ping", () => {
  it("returns true on 200", async () => {
    const mock = createMockFetch([{ status: 200, body: "{}" }]);
    const provider = new LlamaCppProvider({
      fetchImpl: mock.fetch,
    });
    expect(await provider.ping()).toBe(true);
    expect(mock.calls[0].url).toBe("http://localhost:8080/v1/models");
  });

  it("returns false on network error", async () => {
    const mock = createMockFetch([
      { throwError: new Error("network down") },
    ]);
    const provider = new LlamaCppProvider({
      fetchImpl: mock.fetch,
    });
    expect(await provider.ping()).toBe(false);
  });
});

describe("LlamaCppProvider.listModels", () => {
  it("returns model ids from llama.cpp /v1/models", async () => {
    const mock = createMockFetch([
      {
        body: JSON.stringify({
          data: [
            { id: "llama-3-8b" },
          ],
        }),
      },
    ]);
    const provider = new LlamaCppProvider({ fetchImpl: mock.fetch });
    const models = await provider.listModels();
    expect(models).toEqual(["llama-3-8b"]);
    expect(mock.calls[0].url).toBe("http://localhost:8080/v1/models");
  });
});

describe("LlamaCppProvider.showModel", () => {
  it("returns configured context length", async () => {
    const provider = new LlamaCppProvider({ numCtx: 4096 });
    const info = await provider.showModel("some-model");
    expect(info.contextLength).toBe(4096);
  });
});
