import { Agent, type AgentConfig } from "../core/agent.js";
import { defineTool } from "../core/tool.js";
import { recallFacts, rememberFact } from "../tools/memory.js";

export type KBEntry = { q: string; a: string };

/**
 * Customer-support agent grounded in YOUR knowledge base. It can only answer
 * from the provided KB + memory; it escalates (a dangerous tool, gated by
 * onApprove) when it cannot. A template for a business support bot.
 */
export function supportBot(
  kb: KBEntry[],
  opts: { brand?: string; escalate?: (summary: string) => Promise<void> | void } & Partial<AgentConfig> = {},
): Agent {
  const { brand = "our product", escalate, ...overrides } = opts;

  const searchKB = defineTool<{ query: string }>({
    name: "search_kb",
    description: "Search the support knowledge base for an answer.",
    input: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    handler({ query }) {
      const q = query.toLowerCase();
      const hits = kb
        .map((e) => ({ e, score: (e.q + " " + e.a).toLowerCase().split(/\W+/).filter((w) => q.includes(w)).length }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map((x) => x.e);
      return hits.length ? hits : "No KB match. Consider escalating.";
    },
  });

  const escalateTool = defineTool<{ summary: string }>({
    name: "escalate_to_human",
    description: "Hand off to a human when the KB cannot answer or the user is unhappy. Provide a short summary.",
    dangerous: true,
    input: { type: "object", properties: { summary: { type: "string" } }, required: ["summary"] },
    async handler({ summary }) {
      await escalate?.(summary);
      return "Escalated to a human agent. They will follow up.";
    },
  });

  return new Agent({
    system: [
      `You are the support agent for ${brand}. Be warm, brief, and accurate.`,
      "Answer ONLY from search_kb results or remembered facts. Never guess policy, pricing, or capabilities.",
      "If the KB has no answer, or the customer is frustrated, call escalate_to_human with a short summary.",
    ].join(" "),
    tools: [searchKB, recallFacts, rememberFact, escalateTool, ...(overrides.tools ?? [])],
    temperature: overrides.temperature ?? 0.3,
    ...overrides,
  });
}
