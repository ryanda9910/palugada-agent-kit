import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import type { Agent } from "../core/agent.js";

/**
 * Interactive terminal REPL for an agent. Streams text + shows tool calls.
 * `sessionId` ties the conversation to persistent memory across runs.
 */
export async function runCLI(agent: Agent, opts: { sessionId?: string; greeting?: string } = {}) {
  const rl = createInterface({ input: stdin, output: stdout });
  const sessionId = opts.sessionId ?? "cli";
  stdout.write((opts.greeting ?? "Agent ready. Type a message (Ctrl-C to quit).") + "\n\n");

  // graceful exit
  rl.on("SIGINT", () => {
    stdout.write("\nbye.\n");
    process.exit(0);
  });

  while (true) {
    const input = (await rl.question("you › ")).trim();
    if (!input) continue;
    if (["exit", "quit", "/q"].includes(input.toLowerCase())) break;

    stdout.write("\n");
    await agent.run(input, {
      sessionId,
      state: { channel: "cli" },
      onEvent: (e) => {
        if (e.type === "tool_call") stdout.write(`  ⚙ ${e.name}(${JSON.stringify(e.input)})\n`);
        if (e.type === "tool_result") stdout.write(`  ↳ ${e.name} ${e.ms}ms\n`);
      },
    }).then((r) => stdout.write(`\nagent › ${r.text}\n\n`));
  }
  rl.close();
}
