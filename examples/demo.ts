/**
 * Self-driving demo for recordings (VHS/asciinema). Deterministic and key-free:
 * it uses a scripted ModelProvider so the conversation is fixed and free to run,
 * but the TOOLS, the agent loop, and memory are the real thing — and the final
 * replies are built from the actual tool outputs (real time, real arithmetic).
 *
 * Record: `bash make-demo.sh`  ·  Run raw: `tsx examples/demo.ts`
 */
import { Agent } from "../src/core/agent.js";
import { defineTool } from "../src/core/tool.js";
import { EphemeralMemory } from "../src/core/memory.js";
import { coreTools } from "../src/tools/index.js";
import type { ModelProvider, ProviderRequest, ProviderTurn } from "../src/core/provider.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const C = { dim: "\x1b[2m", gold: "\x1b[38;5;220m", cyan: "\x1b[36m", grey: "\x1b[90m", reset: "\x1b[0m", b: "\x1b[1m" };

// a small calc tool (edge-safe parser), alongside the real coreTools (now/remember/...)
const calc = defineTool<{ expression: string }>({
  name: "calculate",
  description: "Evaluate basic arithmetic.",
  input: { type: "object", properties: { expression: { type: "string" } }, required: ["expression"] },
  handler: ({ expression }) => {
    const t = String(expression).match(/\d+\.?\d*|[-+*/()]/g) || [];
    let i = 0;
    const E = (): number => { let v = T(); while (t[i] === "+" || t[i] === "-") v = t[i++] === "+" ? v + T() : v - T(); return v; };
    const T = (): number => { let v = F(); while (t[i] === "*" || t[i] === "/") v = t[i++] === "*" ? v * F() : v / F(); return v; };
    const F = (): number => { const x = t[i++]; if (x === "(") { const v = E(); i++; return v; } return Number(x); };
    return String(E());
  },
});

/** Scripted provider: picks a tool from the user text, then phrases the reply from the real tool output. */
class ScriptedProvider implements ModelProvider {
  readonly model = "demo (scripted, real tools)";
  private pending = "";
  async send(r: ProviderRequest): Promise<ProviderTurn> {
    const last = r.messages[r.messages.length - 1]!;
    // a tool just ran -> phrase the final answer from its real output
    if (last.role === "user" && Array.isArray(last.content) && (last.content[0] as any)?.type === "tool_result") {
      const out = String((last.content[0] as any).content);
      let text = out;
      if (this.pending === "now") { const j = JSON.parse(out); text = `It's ${j.local} in Jakarta right now.`; }
      else if (this.pending === "calculate") text = `That comes to ${out}.`;
      else if (this.pending === "remember") text = out;
      return { content: [{ type: "text", text }], stopReason: "end_turn" };
    }
    const msg = typeof last.content === "string" ? last.content : "";
    const id = "t" + Math.abs(hash(msg));
    if (/time|jakarta|jam/i.test(msg)) {
      this.pending = "now";
      return { content: [{ type: "tool_use", id, name: "now", input: { timezone: "Asia/Jakarta" } }], stopReason: "tool_use" };
    }
    if (/\d/.test(msg)) {
      this.pending = "calculate";
      const expr = msg.match(/[-+*/()\d.\s]+/)?.[0]?.trim() || "0";
      return { content: [{ type: "tool_use", id, name: "calculate", input: { expression: expr } }], stopReason: "tool_use" };
    }
    this.pending = "remember";
    const fact = msg.replace(/^remember[:,]?\s*/i, "").replace(/\.$/, "");
    return { content: [{ type: "tool_use", id, name: "remember", input: { fact } }], stopReason: "tool_use" };
  }
}
const hash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7);

async function type(prefix: string, text: string, color: string, speed = 18) {
  process.stdout.write(prefix);
  for (const ch of text) { process.stdout.write(color + ch + C.reset); await sleep(speed); }
  process.stdout.write("\n");
}

async function main() {
  const agent = new Agent({
    system: "You are the Palu Gada Agent Kit demo.",
    tools: [...coreTools, calc],
    memory: new EphemeralMemory(),
    provider: new ScriptedProvider(),
  });

  console.log(`${C.gold}${C.b}  Palu Gada Agent Kit${C.reset} ${C.dim}— one core, real tools, any model${C.reset}\n`);
  await sleep(500);

  const turns = [
    "What time is it in Jakarta?",
    "Calculate 1499 * 12 + 99",
    "Remember I prefer terse, no-fluff answers",
  ];

  for (const input of turns) {
    await type(`${C.cyan}you ›${C.reset} `, input, C.reset, 22);
    await sleep(250);
    await agent.run(input, {
      sessionId: "demo",
      onEvent: (e) => {
        if (e.type === "tool_call") process.stdout.write(`  ${C.grey}⚙ ${e.name}(${JSON.stringify(e.input)})${C.reset}\n`);
        if (e.type === "tool_result") process.stdout.write(`  ${C.grey}↳ ${e.name} ${e.ms}ms${C.reset}\n`);
      },
    }).then((res) => type(`${C.gold}agent ›${C.reset} `, res.text, C.reset, 14));
    await sleep(700);
    process.stdout.write("\n");
  }

  await sleep(300);
  console.log(`${C.dim}  ── same loop runs on Anthropic or any OpenRouter model ──${C.reset}`);
  console.log(`${C.gold}  palugadahub.com/agent-kit${C.reset}\n`);
}

main();
