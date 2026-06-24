# Gumroad listing — Palu Gada Agent Kit

> Manual upload: Gumroad API can't upload files. Create the product in the
> dashboard, attach `palugada-agent-kit.zip`, paste the copy below.
> Distributable zip: built to `/tmp/palugada-agent-kit.zip` (36K, source + examples + README + LICENSE).

---

## Product name
Palu Gada Agent Kit — the agent-first AI starter kit

## Tagline / summary (≤160 chars)
One agent core that runs anywhere, talks on any channel, and does anything. TypeScript, Anthropic SDK, ~zero deps. Build a real tool-using agent in an afternoon.

## Price
- **Core — $99** (one-time): full source, all channels, all recipes, lifetime updates.
- **Full — $199** (one-time): Core + the Postgres/pgvector memory module, the support-bot recipe with human-escalation, and priority issue support.

(Sell as one product with two tiers, or two products. Recommended: one product, "Core" + "Full" variants.)

## Description (paste into Gumroad)

**Most "AI boilerplates" are a SaaS scaffold with a chat box bolted on. This one is different: it's agent-first.**

The whole product is a real tool-use loop — multi-step, parallel tools, memory, an approval gate for dangerous actions — and everything else (channels, recipes) is a thin wrapper over it. Build a support bot, a research agent, a Telegram assistant, or an internal ops agent from the **same core**. Swap the system prompt and tools, not the plumbing.

**What you get**
- **Universal agent core** — Anthropic SDK tool-use loop: multi-step, runs tools in parallel, loop guard, abort/timeout aware.
- **Memory** — per-session history + durable cross-session facts. File-backed out of the box; Postgres + pgvector (semantic recall) included in Full.
- **Multi-channel** — CLI REPL, HTTP (JSON + SSE streaming, bearer auth), Telegram (long-polling, no public webhook). Same agent, any surface.
- **Tools that ship** — SSRF-safe HTTP fetch (blocks loopback / private / cloud-metadata hosts), memory remember/recall, clock. Add your own with one typed helper.
- **Approval gate** — mark a tool `dangerous` and gate it behind a human/policy check before it runs. Safe by construction.
- **Recipes** — `assistant`, `researcher`, `supportBot` (KB-grounded with human escalation). Copy one, specialize it, ship.
- **TypeScript, strict, ~zero dependencies.** Runs anywhere Node runs — Vercel, a container, a worker, your laptop.

**Five-minute start**
```bash
npm install
cp .env.example .env       # add ANTHROPIC_API_KEY
npm run dev                # a tool-using agent in your terminal
```

**A whole agent is one recipe**
```ts
const agent = new Agent({
  system: "You are an order-status agent. Answer only from get_order.",
  tools: [...coreTools, getOrder],
  onApprove: async ({ name }) => name !== "refund" || await askHuman(),
});
await agent.run("where is order 1234?", { sessionId: "user-42" });
```

**Try it before you buy** → live demo at palugadahub.com/agent-kit (it runs this exact tool-use loop in your browser).

MIT-licensed source. No subscription. Lifetime updates.

## What's inside (file list for the listing)
- `src/core/` — the agent loop, memory, typed tools
- `src/tools/` — http (SSRF-safe), memory, clock
- `src/channels/` — cli, web (JSON + SSE), telegram
- `src/recipes/` — assistant, researcher, supportBot
- `src/memory/` — Postgres + pgvector + embedders (Full)
- `examples/` — cli, server, telegram, support, pg-memory
- README + LICENSE (MIT)

## Tags
ai agent, anthropic, claude, typescript, boilerplate, starter kit, llm, tool use, telegram bot, developer tools

## After purchase / receipt note
Thanks! Unzip, `npm install`, copy `.env.example` → `.env`, add your `ANTHROPIC_API_KEY`, then `npm run dev`. Questions or want a recipe added? Reply to this email.
