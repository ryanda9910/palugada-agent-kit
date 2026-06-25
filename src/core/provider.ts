import type Anthropic from "@anthropic-ai/sdk";
import type { Message } from "./types.js";

/** A normalized model turn: assistant content blocks (Anthropic shape) + why it stopped. */
export type ProviderTurn = {
  /** Content blocks — text and/or tool_use ({ type, id, name, input }). */
  content: any[];
  /** "tool_use" when the model wants tools run; else "end_turn"/etc. */
  stopReason: string | null;
};

export type ProviderRequest = {
  system: string;
  messages: Message[];
  tools: Array<{ name: string; description: string; input_schema: unknown }>;
  maxTokens: number;
  temperature: number;
  signal?: AbortSignal;
};

/**
 * A model backend. The Agent loop, memory, and tools are provider-agnostic;
 * swapping providers swaps the wire format only. Canonical message format is the
 * Anthropic content-block shape, so memory + tool ids stay consistent across
 * providers (you can even switch providers on an existing session).
 */
export interface ModelProvider {
  readonly model: string;
  send(req: ProviderRequest): Promise<ProviderTurn>;
}

/** Default provider: Anthropic Messages API via the official SDK. */
export class AnthropicProvider implements ModelProvider {
  constructor(
    private client: Anthropic,
    readonly model: string,
  ) {}

  async send(r: ProviderRequest): Promise<ProviderTurn> {
    const res = await this.client.messages.create(
      {
        model: this.model,
        max_tokens: r.maxTokens,
        temperature: r.temperature,
        system: r.system,
        messages: r.messages,
        ...(r.tools.length ? { tools: r.tools as Anthropic.Tool[] } : {}),
      },
      { signal: r.signal },
    );
    return { content: res.content, stopReason: res.stop_reason };
  }
}
