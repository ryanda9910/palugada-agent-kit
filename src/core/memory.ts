import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Memory, Message } from "./types.js";

/**
 * Zero-dependency file-backed memory. Conversation history lives in one JSON
 * file per session; durable facts live in a single `facts.json`. Good enough
 * for a single instance / small deployments. Swap this for a Postgres+pgvector
 * implementation (same `Memory` interface) when you need scale + semantic recall.
 */
export class FileMemory implements Memory {
  private dir: string;
  private ready: Promise<void>;

  constructor(dir = process.env.AGENT_MEMORY_DIR || ".agent-memory") {
    this.dir = dir;
    this.ready = mkdir(dir, { recursive: true }).then(() => undefined);
  }

  private sessionFile(id: string) {
    return join(this.dir, `session-${id.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`);
  }
  private get factsFile() {
    return join(this.dir, "facts.json");
  }

  async history(sessionId: string): Promise<Message[]> {
    await this.ready;
    try {
      const raw = await readFile(this.sessionFile(sessionId), "utf8");
      return JSON.parse(raw) as Message[];
    } catch {
      return [];
    }
  }

  async save(sessionId: string, messages: Message[]): Promise<void> {
    await this.ready;
    await writeFile(this.sessionFile(sessionId), JSON.stringify(messages, null, 2));
  }

  async remember(fact: string, opts: { sessionId?: string; tag?: string } = {}): Promise<void> {
    await this.ready;
    const facts = await this.readFacts();
    facts.push({ fact, tag: opts.tag, sessionId: opts.sessionId, at: new Date().toISOString() });
    await writeFile(this.factsFile, JSON.stringify(facts, null, 2));
  }

  async recall(query?: string, limit = 8): Promise<string[]> {
    await this.ready;
    const facts = await this.readFacts();
    const q = query?.toLowerCase().trim();
    const scored = q
      ? facts.filter((f) => f.fact.toLowerCase().includes(q) || f.tag?.toLowerCase().includes(q))
      : facts;
    return scored.slice(-limit).map((f) => f.fact);
  }

  private async readFacts(): Promise<Array<{ fact: string; tag?: string; sessionId?: string; at: string }>> {
    try {
      return JSON.parse(await readFile(this.factsFile, "utf8"));
    } catch {
      return [];
    }
  }
}

/** In-memory store (lost on restart) — handy for tests and stateless demos. */
export class EphemeralMemory implements Memory {
  private sessions = new Map<string, Message[]>();
  private facts: string[] = [];

  async history(sessionId: string) {
    return this.sessions.get(sessionId) ?? [];
  }
  async save(sessionId: string, messages: Message[]) {
    this.sessions.set(sessionId, messages);
  }
  async remember(fact: string) {
    this.facts.push(fact);
  }
  async recall(query?: string, limit = 8) {
    const q = query?.toLowerCase();
    return (q ? this.facts.filter((f) => f.toLowerCase().includes(q)) : this.facts).slice(-limit);
  }
}
