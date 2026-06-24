import { Agent, type AgentConfig } from "../core/agent.js";
import { httpFetch } from "../tools/http.js";
import { now } from "../tools/clock.js";

/**
 * Web researcher — fetches multiple sources, cross-checks, and returns a
 * sourced answer. Higher step budget so it can chase several pages.
 */
export function researcher(overrides: Partial<AgentConfig> = {}): Agent {
  return new Agent({
    system: [
      "You are a rigorous research agent.",
      "Plan: identify the question, fetch 2-4 relevant sources with http_fetch, cross-check claims, then answer.",
      "Quote concrete numbers/dates and always list the source URLs you used.",
      "If sources disagree or you cannot verify, say so explicitly. Never invent citations.",
    ].join(" "),
    tools: [httpFetch, now, ...(overrides.tools ?? [])],
    maxSteps: overrides.maxSteps ?? 16,
    temperature: overrides.temperature ?? 0.2,
    ...overrides,
  });
}
