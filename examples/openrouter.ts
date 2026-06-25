/**
 * Same agent, any model — via OpenRouter (one key: anthropic/*, openai/*,
 * google/*, meta-llama/*, qwen/*, deepseek/*, ...). The loop, tools, memory, and
 * recipes are unchanged; only the provider swaps.
 *
 * Run: `tsx examples/openrouter.ts` (needs OPENROUTER_API_KEY)
 */
import { assistant } from "../src/recipes/assistant.js";
import { runCLI } from "../src/channels/cli.js";
import { OpenRouterProvider } from "../src/providers/openrouter.js";

const provider = new OpenRouterProvider({
  model: process.env.OPENROUTER_MODEL || "anthropic/claude-haiku-4.5",
  title: "Palu Gada Agent Kit",
});

const agent = assistant({ provider });
await runCLI(agent, { sessionId: "openrouter", greeting: `Agent on OpenRouter (${provider.model}).` });
