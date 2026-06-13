import { describe, it, expect } from "vitest";
import { buildAskPrompt } from "../../src/query/prompts.js";
import type { ChatTurn } from "../../src/chat/types.js";

const turn = (q: string, a: string): ChatTurn => ({
  question: q,
  answer: a,
  createdAt: Date.now(),
  sourceIds: [],
  rewrittenQuery: null,
});

describe("buildAskPrompt", () => {
  it("includes the question and context in the user message", () => {
    const out = buildAskPrompt({ question: "x", context: "y" });
    expect(out.user).toContain("Frage: x");
    expect(out.user).toContain("Deine Notizen:\ny");
    expect(out.user).toContain("Antwort:");
  });

  it("contains the 10 numbered rules in the system message", () => {
    const out = buildAskPrompt({ question: "x", context: "y" });
    expect(out.system).toContain("1. ");
    expect(out.system).toContain("9. ");
    expect(out.system).toContain("10. ");
  });

  it("instructs the LLM to use only KB data", () => {
    const p = buildAskPrompt({ question: "x", context: "y" });
    expect(p.system.toLowerCase()).toContain("ausschliesslich");
    // "Wissensdatenbank" is mentioned in the rules (system message)
    expect(p.system.toLowerCase()).toContain("wissensdatenbank");
  });

  it("returns separate system and user strings", () => {
    const out = buildAskPrompt({ question: "test", context: "ctx" });
    expect(typeof out.system).toBe("string");
    expect(typeof out.user).toBe("string");
    expect(out.system.length).toBeGreaterThan(0);
    expect(out.user.length).toBeGreaterThan(0);
  });
});

describe("buildAskPrompt with history", () => {
  it("injects history between rules and context", () => {
    const out = buildAskPrompt({
      question: "and why?",
      context: "CTX",
      history: [turn("what is X?", "X is a thing.")],
    });
    expect(out.user).toContain("Bisheriger Gesprächsverlauf:");
    expect(out.user).toContain("[Nutzer] what is X?");
    expect(out.user).toContain("[Assistent] X is a thing.");
    expect(out.user).toContain("Deine Notizen:\nCTX");
  });

  it("omits the history block when history is empty or missing", () => {
    const out = buildAskPrompt({ question: "x", context: "y", history: [] });
    expect(out.user).not.toContain("Bisheriger Gesprächsverlauf:");
  });
});