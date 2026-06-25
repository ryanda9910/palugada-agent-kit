/**
 * Self-improving memory, wired in with one flag. The agent forms memories on its
 * own: every few turns `reflect()` reads the transcript and extracts durable
 * facts (with dedup/consolidation, salience ranking, and decay). The agent never
 * has to call `remember` mid-chat.
 *
 * Run: `tsx examples/reflective-memory.ts` (needs ANTHROPIC_API_KEY)
 */
import { assistant } from "../src/recipes/assistant.js";
import { runCLI } from "../src/channels/cli.js";

const sessionId = "reflective-demo";
const agent = assistant({ reflective: 4 }); // reflect every 4 turns
const memory = agent.memory as import("../src/memory/reflective.js").ReflectiveMemory;

// flush any background reflection + decay before exit
process.on("SIGINT", async () => {
  await memory.pending;
  const learned = await memory.reflect(sessionId);
  const dropped = await memory.forget();
  console.log(`\n[memory] reflected ${learned} more fact(s), forgot ${dropped} stale.`);
  console.log("[memory] now knows:", (await memory.dump()).map((f) => f.t));
  process.exit(0);
});

await runCLI(agent, {
  sessionId,
  greeting: "Reflective-memory agent. Tell it about yourself; it remembers what matters (Ctrl-C to see).",
});
