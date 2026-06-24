/**
 * Embedding helpers for semantic memory recall. Anthropic has no embeddings API;
 * Voyage AI is its recommended partner. Plug any of these into `PgMemory({ embed })`.
 */

/** Voyage AI embedder. `voyage-3` => 1024 dims. Needs VOYAGE_API_KEY. */
export function voyageEmbed(opts: { model?: string; apiKey?: string } = {}) {
  const model = opts.model ?? "voyage-3";
  const apiKey = opts.apiKey ?? process.env.VOYAGE_API_KEY;
  return async (text: string): Promise<number[]> => {
    if (!apiKey) throw new Error("VOYAGE_API_KEY required for voyageEmbed");
    const res = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ input: text, model }),
    });
    if (!res.ok) throw new Error(`Voyage ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { data: Array<{ embedding: number[] }> };
    return json.data[0]!.embedding;
  };
}

/** OpenAI-compatible embedder (OpenAI, or any /v1/embeddings endpoint). */
export function openaiEmbed(opts: { model?: string; apiKey?: string; baseURL?: string } = {}) {
  const model = opts.model ?? "text-embedding-3-small"; // 1536 dims
  const apiKey = opts.apiKey ?? process.env.OPENAI_API_KEY;
  const baseURL = opts.baseURL ?? "https://api.openai.com/v1";
  return async (text: string): Promise<number[]> => {
    if (!apiKey) throw new Error("OPENAI_API_KEY required for openaiEmbed");
    const res = await fetch(`${baseURL}/embeddings`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ input: text, model }),
    });
    if (!res.ok) throw new Error(`Embed ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { data: Array<{ embedding: number[] }> };
    return json.data[0]!.embedding;
  };
}
