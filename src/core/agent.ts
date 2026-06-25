import Anthropic from "@anthropic-ai/sdk";
import { FileMemory } from "./memory.js";
import { AnthropicProvider, type ModelProvider } from "./provider.js";
import { stringifyToolResult } from "./tool.js";
import type { AgentEvent, Memory, Message, RunResult, Tool, ToolContext } from "./types.js";

export type AgentConfig = {
  /** System prompt — the agent's role + rules. */
  system: string;
  /** Tools the agent may call. */
  tools?: Tool[];
  /** Anthropic model id. Default: env AGENT_MODEL or claude-sonnet-4-6. */
  model?: string;
  /** Max model round-trips before forcing a stop (loop guard). Default 12. */
  maxSteps?: number;
  temperature?: number;
  maxTokens?: number;
  /** Memory backend. Default: FileMemory. */
  memory?: Memory;
  /** Pass an existing Anthropic client (custom baseURL/gateway), else built from ANTHROPIC_API_KEY. */
  client?: Anthropic;
  /**
   * Model backend. Default: Anthropic (from `client`/`model`). Pass an
   * `OpenRouterProvider` (or any `ModelProvider`) to run on a different
   * model/provider — the loop, memory, and tools are unchanged.
   */
  provider?: ModelProvider;
  /**
   * Gate for tools marked `dangerous`. Return true to allow. Default: allow all
   * (override in production to require a human / policy check).
   */
  onApprove?: (call: { name: string; input: unknown; ctx: ToolContext }) => Promise<boolean> | boolean;
};

export type RunOptions = {
  /** Conversation/session id — loads + persists history under it. Default "default". */
  sessionId?: string;
  /** Abort the run (timeouts, client disconnect). */
  signal?: AbortSignal;
  /** Stream of events as the agent works (text deltas, tool calls, etc.). */
  onEvent?: (e: AgentEvent) => void;
  /** Per-run app state passed to every tool (user id, db handle, ...). */
  state?: Record<string, unknown>;
  /** Skip loading/saving persistent history for this run (one-shot). */
  stateless?: boolean;
};

/**
 * The universal agent core: an Anthropic Messages tool-use loop with memory,
 * parallel tool execution, an approval gate for dangerous tools, and an event
 * stream. Channels (CLI/HTTP/Telegram) and recipes are thin wrappers over this.
 */
export class Agent {
  readonly model: string;
  readonly memory: Memory;
  private provider: ModelProvider;
  private tools: Map<string, Tool>;
  private cfg: Required<Pick<AgentConfig, "system" | "maxSteps" | "temperature" | "maxTokens">>;
  private onApprove: NonNullable<AgentConfig["onApprove"]>;

  constructor(config: AgentConfig) {
    const model = config.model || process.env.AGENT_MODEL || "claude-sonnet-4-6";
    this.provider = config.provider ?? new AnthropicProvider(config.client ?? new Anthropic(), model);
    this.model = this.provider.model;
    this.memory = config.memory ?? new FileMemory();
    this.tools = new Map((config.tools ?? []).map((t) => [t.name, t]));
    this.onApprove = config.onApprove ?? (() => true);
    this.cfg = {
      system: config.system,
      maxSteps: config.maxSteps ?? (Number(process.env.AGENT_MAX_STEPS) || 12),
      temperature: config.temperature ?? Number(process.env.AGENT_TEMPERATURE ?? 0.4),
      maxTokens: config.maxTokens ?? 2048,
    };
  }

  /** Register more tools after construction (e.g. recipe composition). */
  addTool(tool: Tool) {
    this.tools.set(tool.name, tool);
    return this;
  }

  /** Run the agent on one user input. Returns the final text + full message trace. */
  async run(input: string, opts: RunOptions = {}): Promise<RunResult> {
    const sessionId = opts.sessionId ?? "default";
    const emit = opts.onEvent ?? (() => {});
    const channel = (opts.state?.channel as string) ?? "api";

    const ctx: ToolContext = {
      memory: this.memory,
      signal: opts.signal,
      channel,
      sessionId,
      state: opts.state ?? {},
      log: (m, extra) => emit({ type: "text", text: `[tool] ${m}${extra ? " " + stringifyToolResult(extra) : ""}` }),
    };

    const prior = opts.stateless ? [] : await this.memory.history(sessionId);
    const messages: Message[] = [...prior, { role: "user", content: input }];

    const toolDefs = [...this.tools.values()].map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema as unknown,
    }));

    let finalText = "";
    let steps = 0;

    for (; steps < this.cfg.maxSteps; steps++) {
      if (opts.signal?.aborted) throw new Error("aborted");

      const res = await this.provider.send({
        system: this.cfg.system,
        messages,
        tools: toolDefs,
        maxTokens: this.cfg.maxTokens,
        temperature: this.cfg.temperature,
        signal: opts.signal,
      });

      emit({ type: "step", index: steps, stopReason: res.stopReason });
      messages.push({ role: "assistant", content: res.content });

      // surface any assistant text
      for (const block of res.content) {
        if (block.type === "text" && block.text) {
          finalText = block.text;
          emit({ type: "text", text: block.text });
        }
      }

      if (res.stopReason !== "tool_use") break;

      // run every requested tool (in parallel) and feed results back
      const toolUses = res.content.filter((b: any): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      const results = await Promise.all(toolUses.map((u) => this.execTool(u, ctx, emit)));
      messages.push({ role: "user", content: results });
    }

    if (!opts.stateless) await this.memory.save(sessionId, messages);
    emit({ type: "done", text: finalText, steps });
    return { text: finalText, messages, steps };
  }

  private async execTool(
    use: Anthropic.ToolUseBlock,
    ctx: ToolContext,
    emit: (e: AgentEvent) => void,
  ): Promise<Anthropic.ToolResultBlockParam> {
    const tool = this.tools.get(use.name);
    if (!tool) {
      return { type: "tool_result", tool_use_id: use.id, content: `Unknown tool: ${use.name}`, is_error: true };
    }
    emit({ type: "tool_call", name: use.name, input: use.input });

    if (tool.dangerous) {
      const ok = await this.onApprove({ name: use.name, input: use.input, ctx });
      if (!ok) {
        emit({ type: "tool_denied", name: use.name, reason: "not approved" });
        return {
          type: "tool_result",
          tool_use_id: use.id,
          content: "Denied: this action was not approved by the operator.",
          is_error: true,
        };
      }
    }

    const start = Date.now();
    try {
      const out = await tool.handler(use.input as Record<string, unknown>, ctx);
      const content = stringifyToolResult(out);
      emit({ type: "tool_result", name: use.name, output: out, ms: Date.now() - start });
      return { type: "tool_result", tool_use_id: use.id, content };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      emit({ type: "tool_result", name: use.name, output: { error: msg }, ms: Date.now() - start });
      return { type: "tool_result", tool_use_id: use.id, content: `Error: ${msg}`, is_error: true };
    }
  }
}
