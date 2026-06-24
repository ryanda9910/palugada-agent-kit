/**
 * Minimal CLI agent. Run: `npm run dev` (needs ANTHROPIC_API_KEY).
 * Shows the smallest end-to-end wiring: a recipe + a channel.
 */
import { assistant } from "../src/recipes/assistant.js";
import { runCLI } from "../src/channels/cli.js";

const agent = assistant();
await runCLI(agent, { sessionId: "demo", greeting: "Palu Gada Agent Kit — assistant ready." });
