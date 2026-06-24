import { defineTool } from "../core/tool.js";

/** Let the agent persist a durable fact across sessions. */
export const rememberFact = defineTool<{ fact: string; tag?: string }>({
  name: "remember",
  description:
    "Save a durable fact to long-term memory (persists across conversations). Use for stable user preferences, decisions, or context worth recalling later. Do not store secrets.",
  input: {
    type: "object",
    properties: {
      fact: { type: "string", description: "The fact to remember, one sentence." },
      tag: { type: "string", description: "Optional category, e.g. 'preference', 'project'." },
    },
    required: ["fact"],
  },
  async handler({ fact, tag }, ctx) {
    await ctx.memory.remember(fact, { sessionId: ctx.sessionId, tag });
    return `Remembered: ${fact}`;
  },
});

/** Let the agent search its long-term memory. */
export const recallFacts = defineTool<{ query?: string }>({
  name: "recall",
  description: "Search long-term memory for previously remembered facts. Optional keyword filter.",
  input: {
    type: "object",
    properties: { query: { type: "string", description: "Optional keyword to filter by." } },
  },
  async handler({ query }, ctx) {
    const facts = await ctx.memory.recall(query, 12);
    return facts.length ? facts : "No matching facts in memory.";
  },
});
