# Security

How the kit handles the risks specific to running an autonomous, tool-using agent.

## Built-in protections

- **SSRF guard on `http_fetch`.** Before any request the target host is resolved
  and rejected if it maps to loopback / private / link-local / cloud-metadata /
  CGNAT ranges (IPv4 and IPv6, including IPv4-mapped `::ffff:` addresses). Only
  `http`/`https` is allowed. Redirects are **not auto-followed** (`redirect:
  "manual"`) — a 3xx returns the `Location` instead, so a redirect to an internal
  host can't bypass the check; following it requires a fresh `http_fetch` call,
  which re-validates the new host.
- **Dangerous-tool approval gate.** Any tool marked `dangerous: true` is passed to
  `onApprove({ name, input, ctx })` before it runs. Default allows (dev). In
  production, supply `onApprove` to require a human/policy decision for
  irreversible actions (refunds, sends, deletes, escalations).
- **Loop guard.** `maxSteps` caps model round-trips so a misbehaving tool loop
  can't run unbounded.
- **HTTP channel auth.** `AGENT_API_TOKENS` (bearer) gates the HTTP endpoints; a
  1 MB request-body cap; CORS configurable. Empty token list = open, intended for
  local dev only — set tokens before exposing it.
- **Telegram allow-list.** `TELEGRAM_ALLOWED_CHATS` restricts who can talk to the
  bot. Empty = anyone (set it for private bots).
- **No `eval` / dynamic code execution** anywhere in the library. No
  `child_process`. The only dependency is the Anthropic SDK (`pg` is an optional
  peer dep you opt into).
- **Parameterized SQL** in `PgMemory` for all values.
- **Constant-time token check.** The HTTP channel compares bearer tokens with
  `crypto.timingSafeEqual` (no early-exit timing oracle).

## Known limitations (defense-in-depth, not airtight)

- **DNS rebinding (TOCTOU).** `http_fetch` resolves the host, validates the IPs,
  then `fetch()` resolves the hostname *again*. An attacker-controlled DNS that
  returns a public IP at check time and a private one at fetch time can still
  slip past the SSRF guard. The guard stops the common cases (literal private
  hosts, metadata IPs, redirects); for fully untrusted/autonomous use, run the
  agent in a network-egress-restricted sandbox rather than relying on the guard
  alone.
- **`http_fetch` is an outbound channel.** The model controls the URL, headers,
  and body, and the SSRF guard only blocks *internal* targets — a prompt-injected
  agent can still POST data to an attacker's *public* URL. Treat `http_fetch` as
  powerful: mark it `dangerous` (or remove it) when the agent handles untrusted
  input and could reach secrets.

## Hardening `http_fetch` for untrusted / autonomous use (opt-in)

The default guard validates the resolved IPs *before* fetching, which leaves the
DNS-rebinding window above. To close it, validate the IP **at connect time** with
an undici dispatcher whose `lookup` rejects private addresses — TLS SNI / Host are
preserved, and there's no TOCTOU because the check runs on the actual connection.

```ts
// npm i undici   (opt-in; the kit stays dep-free by default)
import { Agent } from "undici";
import { lookup as dnsLookup } from "node:dns";
import { isPrivateAddr } from "./src/tools/http.js"; // export it from the SSRF guard

const safeDispatcher = new Agent({
  connect: {
    lookup(hostname, options, cb) {
      dnsLookup(hostname, { ...options, all: true }, (err, addrs) => {
        if (err) return cb(err, "", 0);
        if (addrs.some((a) => isPrivateAddr(a.address))) {
          return cb(new Error(`blocked private address for ${hostname}`), "", 0);
        }
        return options.all ? cb(null, addrs as any, 0) : cb(null, addrs[0].address, addrs[0].family);
      });
    },
  },
});

// pass it to the fetch inside http_fetch (or your own tool):
const res = await fetch(url, { ...opts, dispatcher: safeDispatcher });
```

Even with this, the **durable** control for a fully autonomous agent on untrusted
input is a network-egress-restricted sandbox (firewall / proxy allow-list) — an
app-level guard is defense-in-depth, not a boundary.

## Your responsibilities

- **Keys** live in env (`.env` is gitignored). Never commit real keys; rotate if leaked.
- **Memory is plaintext.** Don't `remember` secrets; the reflection prompt is told
  to skip them, but treat it as best-effort. Encrypt the store if it holds PII.
- **Prompt injection is inherent to agents.** Tool results (web pages, emails, DB
  rows) are untrusted input that the model reads. Keep `dangerous` on anything
  irreversible and gate it with `onApprove`; don't give the agent ambient
  authority (broad DB writes, shell, money movement) without a human in the loop.
- **Custom tools** you add are your trust boundary — validate their inputs and
  scope their permissions.

## Reporting a vulnerability

Email the maintainer (see the repo profile) with details and a repro. Please do
not open a public issue for an undisclosed vulnerability.
