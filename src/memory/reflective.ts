import Anthropic from "@anthropic-ai/sdk";
import type { Memory, Message } from "../core/types.js";

/**
 * A self-improving memory layer that turns any passive `Memory` store into an
 * active one. It adds:
 *   - reflection: after a session, an LLM extracts durable facts from the
 *     transcript (the agent no longer has to remember to call `remember`)
 *   - consolidation/dedup: near-duplicate facts merge; importance is reinforced
 *   - salience: each fact carries importance + use-count + timestamps, and
 *     `recall` ranks by importance + recency + keyword match (and records use)
 *   - decay: `forget()` drops low-value (old, unused, unimportant) facts
 *
 * It wraps ANY base `Memory` (FileMemory / PgMemory / EphemeralMemory): history
 * passes straight through; facts are stored as encoded JSON on the base store,
 * so no backend changes are needed.
 */

type FactType = "semantic" | "episodic" | "procedural" | "preference";

type StoredFact = {
  v: 1;
  t: string; // text
  type: FactType;
  imp: number; // importance 1-5
  use: number; // times recalled
  ts: number; // created (ms)
  last: number; // last used (ms)
  tag?: string;
};

export type ReflectiveMemoryOptions = {
  base: Memory;
  /** Anthropic client for reflection (else built from ANTHROPIC_API_KEY). */
  client?: Anthropic;
  /** Model for reflection/consolidation. Default claude-haiku-4-5 (cheap). */
  model?: string;
  /** Decay: drop facts whose score falls below this. Default 0.6. */
  decayFloor?: number;
  /** Inject a clock for deterministic tests; default Date.now. */
  now?: () => number;
};

const isStored = (s: string): StoredFact | null => {
  try {
    const o = JSON.parse(s);
    return o && o.v === 1 && typeof o.t === "string" ? (o as StoredFact) : null;
  } catch {
    return null;
  }
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();

export class ReflectiveMemory implements Memory {
  private base: Memory;
  private client: Anthropic;
  private model: string;
  private decayFloor: number;
  private now: () => number;

  constructor(opts: ReflectiveMemoryOptions) {
    this.base = opts.base;
    this.client = opts.client ?? new Anthropic();
    this.model = opts.model ?? "claude-haiku-4-5";
    this.decayFloor = opts.decayFloor ?? 0.6;
    this.now = opts.now ?? (() => Date.now());
  }

  // history passes straight through to the base store
  history(sessionId: string): Promise<Message[]> {
    return this.base.history(sessionId);
  }
  save(sessionId: string, messages: Message[]): Promise<void> {
    return this.base.save(sessionId, messages);
  }

  /** Store a fact, consolidating against existing near-duplicates. */
  async remember(
    fact: string,
    opts: { sessionId?: string; tag?: string; type?: FactType; importance?: number } = {},
  ): Promise<void> {
    const all = await this.load();
    const key = norm(fact);
    const dup = all.find((f) => norm(f.t) === key || this.overlaps(norm(f.t), key));
    if (dup) {
      // reinforce instead of duplicating
      dup.imp = Math.min(5, dup.imp + 1);
      dup.last = this.now();
      if (opts.tag && !dup.tag) dup.tag = opts.tag;
      await this.persist(all);
      return;
    }
    const f: StoredFact = {
      v: 1,
      t: fact,
      type: opts.type ?? "semantic",
      imp: opts.importance ?? 3,
      use: 0,
      ts: this.now(),
      last: this.now(),
      tag: opts.tag,
    };
    await this.base.remember(JSON.stringify(f), { sessionId: opts.sessionId, tag: opts.tag });
  }

  /** Recall ranked by importance + recency + keyword match; records usage. */
  async recall(query?: string, limit = 8): Promise<string[]> {
    const all = await this.load();
    if (!all.length) return [];
    const now = this.now();
    const q = query ? norm(query) : "";
    const scored = all
      .map((f) => ({ f, s: this.score(f, q, now) }))
      .filter((x) => (q ? x.s > 0.2 : true))
      .sort((a, b) => b.s - a.s)
      .slice(0, limit);
    // record usage for what we surfaced
    for (const { f } of scored) {
      f.use += 1;
      f.last = now;
    }
    await this.persist(all);
    return scored.map((x) => x.f.t);
  }

  /**
   * Read a session's transcript and extract durable facts worth keeping, then
   * store them (dedup/consolidation is automatic via `remember`). Call this at
   * the end of a conversation. Returns the number of new/updated facts.
   */
  async reflect(sessionId: string, opts: { maxFacts?: number } = {}): Promise<number> {
    const history = await this.base.history(sessionId);
    if (!history.length) return 0;
    const transcript = history
      .map((m) => `${m.role}: ${typeof m.content === "string" ? m.content : JSON.stringify(m.content)}`)
      .join("\n")
      .slice(-12_000);

    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: 700,
      system:
        "You extract durable, reusable memories from a conversation. Return ONLY facts worth remembering across future sessions: stable user preferences, decisions, identity, recurring context, learned procedures. Skip transient chatter, one-off task details, and anything secret (passwords, tokens). Each memory is one concise sentence.",
      messages: [
        {
          role: "user",
          content:
            `Conversation:\n${transcript}\n\nReturn a JSON array (max ${opts.maxFacts ?? 8}) of objects ` +
            `{"text": string, "type": "semantic"|"episodic"|"procedural"|"preference", "importance": 1-5}. ` +
            `If nothing is worth remembering, return []. Output JSON only.`,
        },
      ],
    });

    const text = res.content.find((b) => b.type === "text")?.type === "text"
      ? (res.content.find((b) => b.type === "text") as Anthropic.TextBlock).text
      : "[]";
    let items: Array<{ text: string; type?: FactType; importance?: number }> = [];
    try {
      const m = text.match(/\[[\s\S]*\]/);
      items = m ? JSON.parse(m[0]) : [];
    } catch {
      items = [];
    }
    let n = 0;
    for (const it of items) {
      if (!it?.text) continue;
      await this.remember(it.text, { sessionId, type: it.type, importance: it.importance });
      n++;
    }
    return n;
  }

  /** Drop low-value facts (old + unused + unimportant). Returns count removed. */
  async forget(opts: { floor?: number } = {}): Promise<number> {
    const all = await this.load();
    const now = this.now();
    const floor = opts.floor ?? this.decayFloor;
    const keep = all.filter((f) => this.score(f, "", now) >= floor || f.imp >= 4);
    const removed = all.length - keep.length;
    if (removed > 0) await this.persist(keep);
    return removed;
  }

  /** All facts with their metadata (for inspection / a memory dashboard). */
  async dump(): Promise<StoredFact[]> {
    return this.load();
  }

  // ── internals ──

  private score(f: StoredFact, q: string, now: number): number {
    const ageDays = (now - f.last) / 86_400_000;
    const recency = Math.exp(-ageDays / 30); // half-life ~3 weeks
    const importance = f.imp / 5;
    const usage = Math.min(1, f.use / 5);
    const base = importance * 0.5 + recency * 0.3 + usage * 0.2;
    if (!q) return base;
    const ft = norm(f.t);
    const hit = q.split(" ").some((w) => w.length > 2 && ft.includes(w)) ? 1 : 0;
    return base * 0.5 + hit * 0.5;
  }

  private overlaps(a: string, b: string): boolean {
    const wa = new Set(a.split(" ").filter((w) => w.length > 3));
    const wb = b.split(" ").filter((w) => w.length > 3);
    if (!wb.length || !wa.size) return false;
    const shared = wb.filter((w) => wa.has(w)).length;
    return shared / Math.max(wa.size, wb.length) >= 0.7; // 70% token overlap = same fact
  }

  private async load(): Promise<StoredFact[]> {
    // pull a generous window from the base store and decode
    const raw = await this.base.recall(undefined, 1000);
    return raw.map(isStored).filter((f): f is StoredFact => f !== null);
  }

  /**
   * Re-persist the fact set. The base `Memory` interface has no delete, so this
   * relies on a base that can be rewritten. For stores without rewrite, prefer
   * calling `remember`/`reflect` (append + dedup) and skip `forget`.
   */
  private async persist(facts: StoredFact[]): Promise<void> {
    const anyBase = this.base as unknown as { _rewriteFacts?: (rows: string[]) => Promise<void> };
    if (typeof anyBase._rewriteFacts === "function") {
      await anyBase._rewriteFacts(facts.map((f) => JSON.stringify(f)));
    }
    // If the base can't rewrite, metadata updates (use/imp) are best-effort and
    // lost; facts themselves persist via remember(). reflect() still works.
  }
}
