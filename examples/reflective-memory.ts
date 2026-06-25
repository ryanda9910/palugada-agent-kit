/**
 * Self-improving memory. The agent doesn't have to call `remember` mid-chat —
 * after the conversation, `reflect()` reads the transcript and extracts durable
 * facts, with automatic dedup/consolidation, salience ranking, and decay.
 *
 * Run: `tsx examples/reflective-memory.ts` (needs ANTHROPIC_API_KEY)
 */
import { assistant } from "../src/recipes/assistant.js";
import { runCLI } from "../src/channels/cli.js";
import { FileMemory } from "../src/core/memory.js";
import { ReflectiveMemory } from "../src/memory/reflective.js";

const memory = new ReflectiveMemory({ base: new FileMemory() });
const agent = assistant({ memory });

const sessionId = "reflective-demo";

// reflect + decay when the process exits (Ctrl-C)
process.on("SIGINT", async () => {
  const learned = await memory.reflect(sessionId);
  const dropped = await memory.forget();
  console.log(`\n[memory] reflected ${learned} fact(s), forgot ${dropped} stale. Bye.`);
  process.exit(0);
});

await runCLI(agent, {
  sessionId,
  greeting: "Reflective-memory agent. Tell it things about yourself, quit (Ctrl-C) — it will remember what matters.",
});
