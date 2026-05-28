import { describe, it, expect } from "vitest";
import { ask } from "../../src/query/ask.js";
import { MockLLMProvider } from "../helpers/mock-llm-provider.js";
import { KnowledgeBase } from "../../src/core/kb.js";

const BUNDLE = {
  question: "tell me more about Alan Watts",
  queryType: "conceptual" as const,
  entities: [
    {
      id: "alan-watts",
      name: "Alan Watts",
      type: "person" as const,
      aliases: ["Watts"],
      facts: ["British philosopher", "Wrote The Way of Zen"],
      sources: ["Books/Watts.md"],
    },
  ],
  concepts: [],
  connections: [],
  sources: [{ id: "Books/Watts.md", summary: "Watts notes" }],
};

async function collectChunks(gen: AsyncIterable<any>): Promise<string> {
  let out = "";
  for await (const event of gen) {
    if (event.kind === "chunk") out += event.text;
  }
  return out;
}

describe("ask", () => {
  it("builds a prompt from the bundle and calls the provider", async () => {
    const provider = new MockLLMProvider(["The answer"]);
    const kb = new KnowledgeBase();
    // Add entity so retrieval doesn't short-circuit
    kb.addEntity({ name: "Alan Watts", type: "person", facts: ["philosopher"], source: "x.md" });

    const result = await collectChunks(ask({
      provider,
      model: "gpt-4",
      question: "tell me more about Alan Watts",
      kb,
    }));

    expect(result).toBe("The answer");
    const call = provider.calls[0];
    expect(call.model).toBe("gpt-4");
    expect(call.prompt).toContain("Alan Watts");
    expect(call.prompt).toContain("## ENTITÄTEN");
  });

  it("surfaces errors from the provider", async () => {
    const provider = new MockLLMProvider({ errors: [new Error("LLM Down")] });
    const kb = new KnowledgeBase();
    kb.addEntity({ name: "Alan Watts", type: "person", facts: ["philosopher"], source: "x.md" });

    const events = [];
    for await (const event of ask({
      provider,
      model: "gpt-4",
      question: "tell me more about Alan Watts",
      kb,
    })) {
      events.push(event);
    }
    const errorEvent = events.find(e => e.kind === "error");
    expect(errorEvent).toBeDefined();
    expect(errorEvent.error).toBe("LLM Down");
  });
});

describe("ask with history and retrievalQuery", () => {
  it("threads history into the prompt", async () => {
    const provider = new MockLLMProvider(["The answer"]);
    const kb = new KnowledgeBase();
    kb.addEntity({ name: "Alan Watts", type: "person", facts: ["philosopher"], source: "x.md" });

    await collectChunks(ask({
      provider,
      model: "gpt-4",
      question: "tell me more about Alan Watts",
      kb,
      history: [
        {
          question: "prior q",
          answer: "prior a",
          createdAt: 0,
          sourceIds: [],
        },
      ],
      retrievalQuery: "Alan Watts",
    }));
    const prompt = provider.calls[0]?.prompt ?? "";
    expect(prompt).toContain("Bisheriger Gesprächsverlauf:");
    expect(prompt).toContain("[Nutzer] prior q");
    expect(prompt).toContain("[Assistent] prior a");
  });
});
