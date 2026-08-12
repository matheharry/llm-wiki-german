import { describe, it, expect } from "vitest";
import { ask } from "../../src/query/ask.js";
import type { AnswerEvent } from "../../src/query/types.js";
import { MockLLMProvider } from "../helpers/mock-llm-provider.js";
import { KnowledgeBase } from "../../src/core/kb.js";

async function collectChunks(gen: AsyncIterable<AnswerEvent>): Promise<string> {
  let out = "";
  for await (const event of gen) {
    if (event.kind === "chunk") out += event.text;
  }
  return out;
}

describe("ask — retrievalQuery", () => {
  it("uses retrievalQuery for retrieval but question for the prompt", async () => {
    const provider = new MockLLMProvider(["The answer"]);
    const kb = new KnowledgeBase();
    // Add entity so retrieval doesn't short-circuit
    kb.addEntity({ name: "Alan Watts", type: "person", facts: ["philosopher"], source: "x.md" });

    await collectChunks(ask({
      provider,
      model: "gpt-4",
      question: "and why?",
      kb,
      retrievalQuery: "Alan Watts", // This was used for retrieval, but the prompt should use 'and why?'
    }));
    const prompt = provider.calls[0]?.prompt ?? "";
    expect(prompt).toContain("Frage: and why?");
  });
});
