import { Agent, type AgentConfig } from "../core/agent.js";
import { coreTools } from "../tools/index.js";

/**
 * General-purpose assistant — the "covers anything" default. Web/API access,
 * long-term memory, clock. Drop in extra tools to specialize it.
 */
export function assistant(overrides: Partial<AgentConfig> = {}): Agent {
  return new Agent({
    system: [
      "You are a capable, concise personal assistant.",
      "You can browse the web and call APIs (http_fetch), and you have long-term memory (remember/recall).",
      "Prefer doing the work with tools over guessing. When the user states a stable preference or fact, remember it.",
      "Be direct. No filler. Cite sources/URLs when you used them.",
    ].join(" "),
    tools: [...coreTools, ...(overrides.tools ?? [])],
    ...overrides,
  });
}
