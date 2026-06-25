import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { defineTool } from "../core/tool.js";

/** Reject loopback / private / link-local / reserved hosts (SSRF guard). Exported for opt-in connect-time hardening (see SECURITY.md). */
export function isPrivateAddr(ip: string): boolean {
  if (ip.includes(":")) {
    const v = ip.toLowerCase();
    // IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1) — validate the embedded v4
    const mapped = v.match(/(?:^::ffff:)(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddr(mapped[1]!);
    return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80");
  }
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true;
  const [a, b] = p as [number, number, number, number];
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true; // link-local / cloud metadata
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`Invalid URL: ${raw}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http/https URLs are allowed.");
  }
  const host = url.hostname;
  const ips = isIP(host) ? [host] : (await lookup(host, { all: true })).map((r) => r.address);
  if (!ips.length || ips.some(isPrivateAddr)) {
    throw new Error("Refusing to fetch a private/loopback/link-local address.");
  }
  return url;
}

/**
 * Safe outbound HTTP fetch with an SSRF guard (blocks loopback/private/metadata
 * hosts), a timeout, and a response-size cap. The agent's window onto the web /
 * any REST API.
 */
export const httpFetch = defineTool<{
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}>({
  name: "http_fetch",
  description:
    "Make an HTTP(S) request to a PUBLIC url and return status + (truncated) body. Use for web pages, JSON APIs, webhooks. Private/loopback addresses are blocked.",
  input: {
    type: "object",
    properties: {
      url: { type: "string", description: "Absolute http(s) URL." },
      method: { type: "string", description: "GET (default), POST, PUT, PATCH, DELETE." },
      headers: { type: "object", description: "Optional request headers." },
      body: { type: "string", description: "Optional request body (string / JSON)." },
    },
    required: ["url"],
  },
  async handler({ url, method = "GET", headers = {}, body }, ctx) {
    const safe = await assertPublicUrl(url);
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 12_000);
    ctx.signal?.addEventListener("abort", () => ac.abort());
    try {
      const res = await fetch(safe, {
        method,
        headers: { "user-agent": "palugada-agent-kit/0.1", ...headers },
        body: body && method !== "GET" ? body : undefined,
        signal: ac.signal,
        // Do NOT auto-follow: a redirect to an internal host would bypass the
        // SSRF check above. Surface the redirect target so the agent can decide
        // (and re-fetch it, which re-validates the new host).
        redirect: "manual",
      });
      if (res.status >= 300 && res.status < 400) {
        return {
          status: res.status,
          ok: false,
          redirectedTo: res.headers.get("location"),
          note: "Redirect not followed (SSRF safety). Re-call http_fetch with the redirect URL to follow it (it will be re-validated).",
        };
      }
      const text = await res.text();
      const MAX = 20_000;
      return {
        status: res.status,
        ok: res.ok,
        contentType: res.headers.get("content-type"),
        body: text.length > MAX ? text.slice(0, MAX) + `\n...[truncated ${text.length - MAX} chars]` : text,
      };
    } finally {
      clearTimeout(t);
    }
  },
});
