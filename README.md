# Palu Gada Agent Kit

**One agent core that runs anywhere, talks on any channel, and does anything.**

A small, agent-first starter kit: a universal tool-using agent loop (Anthropic
SDK) + memory + channel adapters (CLI / HTTP / Telegram) + a recipe library you
extend. No framework lock-in, ~zero deps, TypeScript end-to-end.

```ts
import { assistant } from "palugada-agent-kit/recipes";
import { runCLI } from "palugada-agent-kit/channels";

await runCLI(assistant());   // a tool-using agent in your terminal, done.
```

## Why

Most "AI boilerplates" are SaaS scaffolds with a chat box bolted on. This one is
**agent-first**: the core is a real tool-use loop with memory and an approval
gate, and everything else (channels, recipes) is a thin wrapper over it. Build a
support bot, a research agent, a Telegram assistant, or an internal ops agent
from the **same core** — swap the system prompt + tools, not the plumbing.

## Features

- **Universal agent core** — Anthropic Messages tool-use loop: multi-step,
  parallel tool execution, loop guard, abort/timeout aware.
- **Memory** — per-session history + durable cross-session facts. File-backed by
  default; implement the `Memory` interface for Postgres/pgvector.
- **Multi-channel** — CLI REPL, HTTP (JSON + SSE streaming), Telegram
  (long-polling, no public webhook needed). Same agent, any surface.
- **Tools that ship** — safe HTTP fetch with an **SSRF guard** (blocks
  loopback / private / cloud-metadata hosts), memory remember/recall, clock.
- **Approval gate** — mark a tool `dangerous` and gate it behind `onApprove`
  (human/policy) before it runs. Safe by construction.
- **Recipes** — `assistant`, `researcher`, `supportBot` — working agents you
  copy and specialize.
- **Typed tools** — `defineTool<{ ... }>` gives the handler typed input.

## Quickstart

```bash
git clone <this> palugada-agent-kit && cd palugada-agent-kit
npm install
cp .env.example .env          # add ANTHROPIC_API_KEY
npm run dev                    # CLI agent
```

Other entrypoints:

```bash
npm run serve                 # HTTP agent on :8787
npm run telegram              # Telegram bot (set TELEGRAM_BOT_TOKEN)
npx tsx examples/support.ts   # KB-grounded support bot w/ escalation
```

HTTP usage:

```bash
curl -XPOST localhost:8787/chat -d '{"message":"what time is it in Jakarta?"}'
curl -N -XPOST localhost:8787/chat/stream -d '{"message":"research X and cite sources"}'
```

## Build your own agent

```ts
import { Agent, defineTool } from "palugada-agent-kit";
import { coreTools } from "palugada-agent-kit/tools";

const getOrder = defineTool<{ id: string }>({
  name: "get_order",
  description: "Look up an order by id.",
  input: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  handler: async ({ id }, ctx) => db.orders.find(id),   // ctx: memory, signal, state, log
});

const agent = new Agent({
  system: "You are an order-status agent. Answer only from get_order.",
  tools: [...coreTools, getOrder],
  // gate destructive tools:
  onApprove: async ({ name }) => name !== "refund" || await askHuman(),
});

const { text } = await agent.run("where is order 1234?", { sessionId: "user-42" });
```

## Any model — Anthropic or OpenRouter

The model call sits behind a `ModelProvider`. Default is Anthropic direct. Swap in
OpenRouter to run **any** model (anthropic/_, openai/_, google/_, meta-llama/_,
qwen/_, deepseek/_, …) on one key — the loop, tools, memory, and recipes don't change:

```ts
import { OpenRouterProvider } from "palugada-agent-kit/providers";

const agent = assistant({
  provider: new OpenRouterProvider({ model: "anthropic/claude-haiku-4.5" }), // or "openai/gpt-4o-mini", "qwen/qwen-2.5-72b-instruct", ...
});
```

OpenRouter speaks the OpenAI format; the provider translates the canonical
(Anthropic-block) messages to/from OpenAI per call, so memory + tool-call ids stay
consistent — you can even switch providers on an existing session. Write your own
`ModelProvider` for a gateway, a local model, or Bedrock/Vertex.

## Architecture

```
src/
  core/      agent.ts (the loop) · memory.ts · tool.ts · types.ts
  tools/     http (SSRF-safe) · memory · clock     -> coreTools
  channels/  cli · web (JSON+SSE) · telegram
  recipes/   assistant · researcher · supportBot
examples/    cli · server · telegram · support
```

The whole product is the `Agent` class. A **channel** turns some input source
into `agent.run(text, { sessionId })`. A **recipe** is a preset `Agent`
(system + tools). A **tool** is `{ name, description, input_schema, handler }`.

## Memory backends

Three backends ship; all implement the same `Memory` interface:

- `FileMemory` (default) — JSON under `AGENT_MEMORY_DIR`. Zero deps.
- `EphemeralMemory` — in-process, lost on restart. Tests/demos.
- `PgMemory` — Postgres + optional **pgvector semantic recall**.

```ts
import { PgMemory } from "palugada-agent-kit/memory/pg";
import { voyageEmbed } from "palugada-agent-kit/memory/embed"; // or openaiEmbed

const memory = new PgMemory({
  connectionString: process.env.DATABASE_URL,
  dim: 1024,
  embed: voyageEmbed(),   // omit -> keyword (ILIKE) recall on plain Postgres
});
await memory.init();       // creates tables + (if embed) the vector extension
new Agent({ system, tools, memory });
```

`pg` is an optional peer dep (`npm i pg`). With `embed`, `recall()` is semantic
(`embedding <=> query`); without it, keyword — same interface either way.

### Self-improving memory

`ReflectiveMemory` wraps any base store and turns passive storage into active
memory — the agent stops having to remember to call `remember`:

```ts
import { ReflectiveMemory } from "palugada-agent-kit/memory/reflective";

const memory = new ReflectiveMemory({ base: new FileMemory() }); // wrap any Memory
const agent = assistant({ memory });

await agent.run("I'm in Jakarta and I prefer terse answers", { sessionId: "u1" });
await memory.reflect("u1");   // LLM reads the transcript, extracts durable facts
await memory.forget();        // decay: drop old, unused, low-importance facts
```

What it adds on top of the base store:

- **Reflection** — `reflect(sessionId)` extracts durable facts from the transcript
  (preferences, decisions, identity), so memory forms automatically.
- **Consolidation** — near-duplicate facts (≥70% token overlap) merge and
  reinforce importance instead of piling up.
- **Salience** — every fact carries `importance / use-count / timestamps`;
  `recall` ranks by importance + recency + keyword match and records each use.
- **Decay** — `forget()` drops facts whose score falls below a floor (old +
  unused + unimportant), keeping memory small and relevant.

Backend-agnostic: facts are stored as encoded rows on the base `Memory`, so it
works over `FileMemory`, `PgMemory`, or `EphemeralMemory` unchanged.

## Deploy

- **HTTP**: `serve(agent)` is a plain Node `http` server — runs on Vercel
  Functions, a container, Fly, Railway, anywhere Node runs. Put `AGENT_API_TOKENS`
  in front for auth.
- **Telegram**: long-polling, so it runs behind NAT (a laptop, a worker). No
  webhook/public URL required.
- **Cron / ops agents**: import the `Agent` and call `agent.run(...)` from any
  scheduled job.

## Safety notes

- The HTTP tool blocks private/loopback/link-local/cloud-metadata targets (SSRF).
- `dangerous` tools require `onApprove` to return true — default allows; override
  in production.
- Memory stores plaintext — don't `remember` secrets; encrypt the store if needed.

## License

MIT.
