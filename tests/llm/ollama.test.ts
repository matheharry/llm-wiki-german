import { describe, it, expect, afterEach } from "vitest";
import { OllamaProvider } from "../../src/llm/ollama.js";
import { createMockFetch } from "../helpers/mock-fetch.js";

const origFetch = globalThis.fetch;

describe("OllamaProvider.complete", () => {
  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  it("streams tokens from a single-chunk NDJSON response", async () => {
    const ndjson =
      JSON.stringify({ message: { content: "Hello" }, done: false }) +
      "\n" +
      JSON.stringify({ message: { content: " world" }, done: false }) +
      "\n" +
      JSON.stringify({ message: { content: "" }, done: true }) +
      "\n";
    const mock = createMockFetch([{ chunks: [ndjson] }]);
    globalThis.fetch = mock.fetch;

    const provider = new OllamaProvider({ url: "http://localhost:11434" });
    const tokens: string[] = [];
    for await (const chunk of provider.complete({
      prompt: "hi",
      model: "gemma4:e4b-it-qat",
    })) {
      tokens.push(chunk);
    }

    expect(tokens.join("")).toBe("Hello world");
    expect(mock.calls).toHaveLength(1);
    expect(mock.calls[0].url).toBe("http://localhost:11434/api/chat");
    expect(mock.calls[0].method).toBe("POST");
    const body = JSON.parse(mock.calls[0].body!);
    expect(body.model).toBe("gemma4:e4b-it-qat");
    expect(body.messages).toEqual([{ role: "user", content: "hi" }]);
    expect(body.stream).toBe(true);
    expect(body.options.temperature).toBe(0.1);
    expect(body.options.num_ctx).toBe(16384);
  });

  it("handles NDJSON lines split across chunks", async () => {
    const full =
      JSON.stringify({ message: { content: "foo" }, done: false }) +
      "\n" +
      JSON.stringify({ message: { content: "bar" }, done: false }) +
      "\n" +
      JSON.stringify({ message: { content: "" }, done: true }) +
      "\n";
    const mid = Math.floor(full.length / 2);
    const chunks = [full.slice(0, 8), full.slice(8, mid), full.slice(mid)];
    const mock = createMockFetch([{ chunks }]);
    globalThis.fetch = mock.fetch;

    const provider = new OllamaProvider({ url: "http://localhost:11434" });
    const out: string[] = [];
    for await (const chunk of provider.complete({
      prompt: "x",
      model: "gemma4:e4b-it-qat",
    })) {
      out.push(chunk);
    }
    expect(out.join("")).toBe("foobar");
  });

  it("yields content from the final NDJSON line even when done:true is set on the same line", async () => {
    // /api/chat often sends the last token and done:true together
    const ndjson =
      JSON.stringify({ message: { content: "Berlin" }, done: false }) +
      "\n" +
      JSON.stringify({ message: { content: " ist" }, done: false }) +
      "\n" +
      JSON.stringify({ message: { content: " Hauptstadt" }, done: true }) +
      "\n";
    const mock = createMockFetch([{ chunks: [ndjson] }]);
    globalThis.fetch = mock.fetch;

    const provider = new OllamaProvider({ url: "http://localhost:11434" });
    const tokens: string[] = [];
    for await (const chunk of provider.complete({
      prompt: "x",
      model: "gemma4:e4b-it-qat",
    })) {
      tokens.push(chunk);
    }

    expect(tokens.join("")).toBe("Berlin ist Hauptstadt");
  });

  it("uses the configured default numCtx when no request-specific value is provided", async () => {
    const mock = createMockFetch([{ chunks: [JSON.stringify({ message: { content: "ok" }, done: true }) + "\n"] }]);
    globalThis.fetch = mock.fetch;

    const provider = new OllamaProvider({ url: "http://localhost:11434", numCtx: 4096 });
    const tokens: string[] = [];
    for await (const _ of provider.complete({
      prompt: "x",
      model: "gemma4:e4b-it-qat",
    })) {
      tokens.push(_);
    }

    expect(tokens.join("")).toBe("ok");
    const body = JSON.parse(mock.calls[0].body!);
    expect(body.options.num_ctx).toBe(4096);
  });

  it("throws LLMAbortError if signal is already aborted", async () => {
    const mock = createMockFetch([{ chunks: ["{}"] }]);
    globalThis.fetch = mock.fetch;

    const provider = new OllamaProvider({});
    const controller = new AbortController();
    controller.abort();

    await expect(async () => {
      for await (const _ of provider.complete({
        prompt: "x",
        model: "gemma4:e4b-it-qat",
        signal: controller.signal,
      })) {
        void _;
      }
    }).rejects.toMatchObject({ name: "LLMAbortError" });
  });

  it("throws LLMHttpError on non-2xx response", async () => {
    const mock = createMockFetch([{ status: 500, body: "boom" }]);
    globalThis.fetch = mock.fetch;

    const provider = new OllamaProvider({});
    await expect(async () => {
      for await (const _ of provider.complete({
        prompt: "x",
        model: "gemma4:e4b-it-qat",
      })) {
        void _;
      }
    }).rejects.toMatchObject({ name: "LLMHttpError", status: 500 });
  });
});