import type { ModelProvider, ProviderRequest, ProviderTurn } from "../core/provider.js";
import type { Message } from "../core/types.js";

/**
 * OpenRouter provider — one key, many models (anthropic/*, openai/*, google/*,
 * meta-llama/*, qwen/*, deepseek/*, ...), with provider fallbacks and lower cost.
 *
 *   import { OpenRouterProvider } from "palugada-agent-kit/providers/openrouter";
 *   const provider = new OpenRouterProvider({ model: "anthropic/claude-haiku-4.5" });
 *   new Agent({ system, tools, provider });
 *
 * OpenRouter speaks the OpenAI chat-completions format, so this translates the
 * canonical (Anthropic content-block) messages to/from OpenAI on each call. The
 * Agent loop, memory, and tools are unchanged.
 */
export class OpenRouterProvider implements ModelProvider {
  readonly model: string;
  private apiKey: string;
  private baseURL: string;
  private headers: Record<string, string>;

  constructor(opts: {
    model: string;
    apiKey?: string;
    baseURL?: string;
    /** Optional attribution headers OpenRouter shows on your dashboard. */
    referer?: string;
    title?: string;
  }) {
    this.model = opts.model;
    this.apiKey = opts.apiKey ?? process.env.OPENROUTER_API_KEY ?? "";
    this.baseURL = opts.baseURL ?? "https://openrouter.ai/api/v1";
    this.headers = {
      "content-type": "application/json",
      authorization: `Bearer ${this.apiKey}`,
      ...(opts.referer ? { "HTTP-Referer": opts.referer } : {}),
      ...(opts.title ? { "X-Title": opts.title } : {}),
    };
  }

  async send(r: ProviderRequest): Promise<ProviderTurn> {
    if (!this.apiKey) throw new Error("OPENROUTER_API_KEY required for OpenRouterProvider");
    const messages = toOpenAI(r.system, r.messages);
    const tools = r.tools.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.input_schema },
    }));

    const res = await fetch(`${this.baseURL}/chat/completions`, {
      method: "POST",
      headers: this.headers,
      signal: r.signal,
      body: JSON.stringify({
        model: this.model,
        max_tokens: r.maxTokens,
        temperature: r.temperature,
        messages,
        ...(tools.length ? { tools } : {}),
      }),
    });
    if (!res.ok) throw new Error(`openrouter ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = (await res.json()) as { choices?: Array<{ message?: any }> };
    const msg = json.choices?.[0]?.message;
    if (!msg) throw new Error("openrouter: empty response");

    // OpenAI message -> canonical Anthropic content blocks
    const content: any[] = [];
    if (msg.content) content.push({ type: "text", text: msg.content });
    for (const c of msg.tool_calls ?? []) {
      let input: unknown = {};
      try { input = JSON.parse(c.function?.arguments || "{}"); } catch {}
      content.push({ type: "tool_use", id: c.id, name: c.function?.name, input });
    }
    return { content, stopReason: msg.tool_calls?.length ? "tool_use" : "end_turn" };
  }
}

/** Translate canonical (Anthropic content-block) messages to OpenAI chat format. */
function toOpenAI(system: string, messages: Message[]): any[] {
  const out: any[] = [{ role: "system", content: system }];
  for (const m of messages) {
    const content = m.content;
    if (m.role === "user") {
      if (typeof content === "string") {
        out.push({ role: "user", content });
        continue;
      }
      // a user turn may carry tool_result blocks (and/or text)
      const texts: string[] = [];
      for (const b of content as any[]) {
        if (b.type === "tool_result") {
          out.push({
            role: "tool",
            tool_call_id: b.tool_use_id,
            content: typeof b.content === "string" ? b.content : JSON.stringify(b.content),
          });
        } else if (b.type === "text") {
          texts.push(b.text);
        }
      }
      if (texts.length) out.push({ role: "user", content: texts.join("\n") });
    } else if (m.role === "assistant") {
      let text = "";
      const toolCalls: any[] = [];
      for (const b of content as any[]) {
        if (b.type === "text") text += b.text;
        else if (b.type === "tool_use") {
          toolCalls.push({
            id: b.id,
            type: "function",
            function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) },
          });
        }
      }
      out.push({
        role: "assistant",
        content: text || null,
        ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
      });
    }
  }
  return out;
}
