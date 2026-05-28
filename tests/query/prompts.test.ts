import { describe, it, expect } from "vitest";
import { buildAskPrompt } from "../../src/query/prompts.js";
import type { ChatTurn } from "../../src/chat/types.js";

const turn = (q: string, a: string): ChatTurn => ({
  question: q,
  answer: a,
  createdAt: Date.now(),
  sourceIds: [],
});

describe("buildAskPrompt", () => {
  it("includes the question and context block", () => {
    const out = buildAskPrompt({ question: "x", context: "y" });
    expect(out).toContain("Frage: x");
    expect(out).toContain("Deine Notizen:\ny");
    expect(out).toContain("Antwort:");
  });

  it("contains the 9 numbered rules", () => {
    const out = buildAskPrompt({ question: "x", context: "y" });
    // There are actually 10 rules now after my localization edit
    expect(out).toContain("1. ");
    expect(out).toContain("9. ");
    expect(out).toContain("10. ");
  });

  it("instructs the LLM to use only KB data", () => {
    const p = buildAskPrompt({ question: "x", context: "y" });
    expect(p.toLowerCase()).toContain("ausschliesslich");
    expect(p.toLowerCase()).toContain("wissensdatenbank");
  });
});

describe("buildAskPrompt with history", () => {
  it("injects history between rules and context", () => {
    const out = buildAskPrompt({
      question: "and why?",
      context: "CTX",
      history: [turn("what is X?", "X is a thing.")],
    });
    expect(out).toContain("Bisheriger Gesprächsverlauf:");
    expect(out).toContain("[Nutzer] what is X?");
    expect(out).toContain("[Assistent] X is a thing.");
    expect(out).toContain("Deine Notizen:\nCTX");
  });

  it("omits the history block when history is empty or missing", () => {
    const out = buildAskPrompt({ question: "x", context: "y", history: [] });
    expect(out).not.toContain("Bisheriger Gesprächsverlauf:");
  });
});
