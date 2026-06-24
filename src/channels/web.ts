import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { Agent } from "../core/agent.js";

type WebOptions = {
  port?: number;
  /** Bearer tokens allowed to call the API. Empty = open (dev only). */
  tokens?: string[];
  /** CORS allow-origin header. Default "*". */
  cors?: string;
};

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > 1_000_000) {
        reject(new Error("body too large"));
        req.destroy();
      }
      data += c;
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

/**
 * HTTP channel. Two endpoints:
 *   POST /chat         -> { text, steps }            (buffered JSON reply)
 *   POST /chat/stream  -> text/event-stream of AgentEvent (SSE, live)
 * Body: { message: string, sessionId?: string }. Auth via `Authorization: Bearer <token>`
 * when `tokens` is non-empty.
 */
export function createWebHandler(agent: Agent, opts: WebOptions = {}) {
  const tokens = opts.tokens ?? (process.env.AGENT_API_TOKENS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const cors = opts.cors ?? "*";

  const authed = (req: IncomingMessage) => {
    if (!tokens.length) return true;
    const h = req.headers.authorization || "";
    const tok = h.startsWith("Bearer ") ? h.slice(7) : "";
    return tokens.includes(tok);
  };

  return async (req: IncomingMessage, res: ServerResponse) => {
    res.setHeader("Access-Control-Allow-Origin", cors);
    res.setHeader("Access-Control-Allow-Headers", "content-type, authorization");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    if (req.method === "OPTIONS") return res.writeHead(204).end();

    const url = new URL(req.url || "/", "http://x");
    if (req.method === "GET" && url.pathname === "/health") {
      return res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ok: true }));
    }
    if (req.method !== "POST" || !url.pathname.startsWith("/chat")) {
      return res.writeHead(404).end("not found");
    }
    if (!authed(req)) return res.writeHead(401).end("unauthorized");

    let payload: { message?: string; sessionId?: string };
    try {
      payload = JSON.parse((await readBody(req)) || "{}");
    } catch {
      return res.writeHead(400).end("bad json");
    }
    const message = (payload.message || "").trim();
    if (!message) return res.writeHead(400).end("missing message");
    const sessionId = payload.sessionId || "web";

    const stream = url.pathname === "/chat/stream";
    if (stream) {
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      const ac = new AbortController();
      req.on("close", () => ac.abort());
      try {
        await agent.run(message, {
          sessionId,
          signal: ac.signal,
          state: { channel: "web" },
          onEvent: (e) => res.write(`data: ${JSON.stringify(e)}\n\n`),
        });
      } catch (err) {
        res.write(`data: ${JSON.stringify({ type: "error", error: String(err) })}\n\n`);
      }
      return res.end();
    }

    try {
      const r = await agent.run(message, { sessionId, state: { channel: "web" } });
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ text: r.text, steps: r.steps }));
    } catch (err) {
      res.writeHead(500, { "content-type": "application/json" }).end(JSON.stringify({ error: String(err) }));
    }
  };
}

/** Convenience: build the handler and start listening. */
export function serve(agent: Agent, opts: WebOptions = {}) {
  const port = opts.port ?? (Number(process.env.PORT) || 8787);
  const server = createServer(createWebHandler(agent, opts));
  server.listen(port, () => console.log(`agent http channel on :${port} (POST /chat, POST /chat/stream)`));
  return server;
}
