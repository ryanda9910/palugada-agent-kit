import { Agent, type AgentConfig } from "../core/agent.js";
import { FileMemory } from "../core/memory.js";
import { coreTools } from "../tools/index.js";
import { ReflectiveMemory } from "../memory/reflective.js";

export type AssistantOptions = Partial<AgentConfig> & {
  /**
   * Wrap memory in ReflectiveMemory (self-improving: auto-extracts durable facts,
   * dedups, decays). `true` reflects every 6 turns; a number sets the cadence.
   * Needs an API key (uses the LLM to reflect). Default off.
   */
  reflective?: boolean | number;
};

/**
 * General-purpose assistant — the "covers anything" default. Web/API access,
 * long-term memory, clock. Drop in extra tools to specialize it. Pass
 * `reflective: true` to give it self-improving memory.
 */
export function assistant(overrides: AssistantOptions = {}): Agent {
  const { reflective, ...cfg } = overrides;
  let memory = cfg.memory;
  if (reflective) {
    memory = new ReflectiveMemory({
      base: memory ?? new FileMemory(),
      autoReflectEvery: typeof reflective === "number" ? reflective : 6,
    });
  }
  return new Agent({
    system: [
      "You are a capable, concise personal assistant.",
      "You can browse the web and call APIs (http_fetch), and you have long-term memory (remember/recall).",
      "Prefer doing the work with tools over guessing. When the user states a stable preference or fact, remember it.",
      "Be direct. No filler. Cite sources/URLs when you used them.",
    ].join(" "),
    tools: [...coreTools, ...(cfg.tools ?? [])],
    ...cfg,
    memory,
  });
}
