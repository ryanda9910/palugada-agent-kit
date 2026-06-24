import type { Memory, Message } from "../core/types.js";

/**
 * Postgres-backed memory with optional pgvector semantic recall.
 *
 * Requires the `pg` driver (peer dep — `npm i pg`) and, for semantic recall, the
 * `pgvector` extension + an `embed` function. Without `embed` it falls back to
 * keyword (ILIKE) recall, so it works on plain Postgres too.
 *
 *   import { PgMemory } from "palugada-agent-kit/memory/pg";
 *   const mem = new PgMemory({ connectionString: process.env.DATABASE_URL, dim: 1024, embed });
 *   await mem.init();
 *   new Agent({ system, tools, memory: mem });
 *
 * `embed` should return a vector of length `dim` (e.g. Voyage `voyage-3`, 1024).
 */
export type PgMemoryOptions = {
  /** A `pg` Pool/Client, OR a connection string to build one. */
  pool?: { query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }> };
  connectionString?: string;
  /** Embedding dimension (must match your `embed` output). Default 1024. */
  dim?: number;
  /** Async embedder; omit for keyword-only recall. */
  embed?: (text: string) => Promise<number[]>;
  /** Table name prefix. Default "agent". */
  prefix?: string;
};

export class PgMemory implements Memory {
  private pool!: NonNullable<PgMemoryOptions["pool"]>;
  private dim: number;
  private embed?: (text: string) => Promise<number[]>;
  private p: string;
  private opts: PgMemoryOptions;
  private inited = false;

  constructor(opts: PgMemoryOptions) {
    this.opts = opts;
    this.dim = opts.dim ?? 1024;
    this.embed = opts.embed;
    this.p = opts.prefix ?? "agent";
  }

  /** Create tables/extension if missing. Call once at boot. */
  async init() {
    if (this.inited) return;
    if (this.opts.pool) {
      this.pool = this.opts.pool;
    } else {
      // lazy import so `pg` stays an optional peer dependency (no types required to build)
      // @ts-expect-error optional peer dependency, resolved at runtime
      const pg = await import("pg").catch(() => {
        throw new Error("PgMemory needs the `pg` package. Run: npm i pg");
      });
      const Pool = (pg as any).default?.Pool ?? (pg as any).Pool;
      this.pool = new Pool({ connectionString: this.opts.connectionString });
    }

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ${this.p}_history (
        session_id TEXT PRIMARY KEY,
        messages   JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);

    if (this.embed) {
      await this.pool.query(`CREATE EXTENSION IF NOT EXISTS vector`).catch(() => {
        throw new Error("pgvector extension not available. Install it, or construct PgMemory without `embed` for keyword recall.");
      });
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS ${this.p}_facts (
          id         BIGSERIAL PRIMARY KEY,
          fact       TEXT NOT NULL,
          tag        TEXT,
          session_id TEXT,
          embedding  vector(${this.dim}),
          at         TIMESTAMPTZ NOT NULL DEFAULT now()
        )`);
    } else {
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS ${this.p}_facts (
          id         BIGSERIAL PRIMARY KEY,
          fact       TEXT NOT NULL,
          tag        TEXT,
          session_id TEXT,
          at         TIMESTAMPTZ NOT NULL DEFAULT now()
        )`);
    }
    this.inited = true;
  }

  async history(sessionId: string): Promise<Message[]> {
    await this.init();
    const { rows } = await this.pool.query(`SELECT messages FROM ${this.p}_history WHERE session_id = $1`, [sessionId]);
    return rows[0]?.messages ?? [];
  }

  async save(sessionId: string, messages: Message[]): Promise<void> {
    await this.init();
    await this.pool.query(
      `INSERT INTO ${this.p}_history (session_id, messages, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (session_id) DO UPDATE SET messages = EXCLUDED.messages, updated_at = now()`,
      [sessionId, JSON.stringify(messages)],
    );
  }

  async remember(fact: string, opts: { sessionId?: string; tag?: string } = {}): Promise<void> {
    await this.init();
    if (this.embed) {
      const vec = await this.embed(fact);
      await this.pool.query(
        `INSERT INTO ${this.p}_facts (fact, tag, session_id, embedding) VALUES ($1, $2, $3, $4)`,
        [fact, opts.tag ?? null, opts.sessionId ?? null, toVector(vec)],
      );
    } else {
      await this.pool.query(
        `INSERT INTO ${this.p}_facts (fact, tag, session_id) VALUES ($1, $2, $3)`,
        [fact, opts.tag ?? null, opts.sessionId ?? null],
      );
    }
  }

  async recall(query?: string, limit = 8): Promise<string[]> {
    await this.init();
    if (this.embed && query) {
      const vec = await this.embed(query);
      const { rows } = await this.pool.query(
        `SELECT fact FROM ${this.p}_facts ORDER BY embedding <=> $1 LIMIT $2`,
        [toVector(vec), limit],
      );
      return rows.map((r) => r.fact);
    }
    if (query) {
      const { rows } = await this.pool.query(
        `SELECT fact FROM ${this.p}_facts WHERE fact ILIKE $1 OR tag ILIKE $1 ORDER BY at DESC LIMIT $2`,
        [`%${query}%`, limit],
      );
      return rows.map((r) => r.fact);
    }
    const { rows } = await this.pool.query(`SELECT fact FROM ${this.p}_facts ORDER BY at DESC LIMIT $1`, [limit]);
    return rows.map((r) => r.fact);
  }
}

/** pgvector accepts a vector literal like `[0.1,0.2,...]`. */
function toVector(v: number[]): string {
  return `[${v.join(",")}]`;
}
