import type Anthropic from "@anthropic-ai/sdk";

/** A message in the conversation, in the Anthropic Messages shape. */
export type Message = Anthropic.MessageParam;

/** JSON Schema describing a tool's input (Anthropic `input_schema`). */
export type JSONSchema = {
  type: "object";
  properties?: Record<string, unknown>;
  required?: string[];
  [k: string]: unknown;
};

/**
 * Runtime context handed to every tool handler. Carries shared services
 * (memory, logger, abort signal, the channel that triggered the run, and a
 * free-form `state` bag for app data like a user id or db handle).
 */
export type ToolContext = {
  memory: Memory;
  signal?: AbortSignal;
  log: (msg: string, extra?: unknown) => void;
  channel: string;
  sessionId: string;
  state: Record<string, unknown>;
};

/**
 * A tool the agent can call. `handler` returns a string (or any JSON-able value).
 * Default `I = any` so specifically-typed tools (e.g. `Tool<{url:string}>`) stay
 * assignable to the erased `Tool` used in tool arrays (handler input is contravariant).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Tool<I = any> = {
  name: string;
  description: string;
  input_schema: JSONSchema;
  /** Set true to require explicit approval before the tool runs (see Agent `onApprove`). */
  dangerous?: boolean;
  handler: (input: I, ctx: ToolContext) => Promise<unknown> | unknown;
};

/** Persistent + per-session memory store. */
export interface Memory {
  /** Load the message history for a session (empty if none). */
  history(sessionId: string): Promise<Message[]>;
  /** Replace the message history for a session. */
  save(sessionId: string, messages: Message[]): Promise<void>;
  /** Append durable, cross-session facts the agent chose to remember. */
  remember(fact: string, opts?: { sessionId?: string; tag?: string }): Promise<void>;
  /** Recall durable facts, optionally filtered by a keyword. */
  recall(query?: string, limit?: number): Promise<string[]>;
}

/** Emitted as the agent works — wire to logs, SSE, a UI, etc. */
export type AgentEvent =
  | { type: "text"; text: string }
  | { type: "tool_call"; name: string; input: unknown }
  | { type: "tool_result"; name: string; output: unknown; ms: number }
  | { type: "tool_denied"; name: string; reason: string }
  | { type: "step"; index: number; stopReason: string | null }
  | { type: "done"; text: string; steps: number };

export type RunResult = {
  /** Final assistant text. */
  text: string;
  /** Full message list (assistant + tool turns) for this run. */
  messages: Message[];
  /** How many model round-trips it took. */
  steps: number;
};
