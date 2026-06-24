/**
 * Agent with Postgres + pgvector semantic memory. Needs `npm i pg`,
 * DATABASE_URL, and (for semantic recall) the pgvector extension + VOYAGE_API_KEY.
 * Run: `tsx examples/pg-memory.ts`
 */
import { assistant } from "../src/recipes/assistant.js";
import { runCLI } from "../src/channels/cli.js";
import { PgMemory } from "../src/memory/pg.js";
import { voyageEmbed } from "../src/memory/embed.js";

const memory = new PgMemory({
  connectionString: process.env.DATABASE_URL,
  dim: 1024,
  embed: voyageEmbed(), // omit this line for keyword-only recall on plain Postgres
});
await memory.init();

const agent = assistant({ memory });
await runCLI(agent, { sessionId: "pg-demo", greeting: "Agent with pgvector memory ready." });
