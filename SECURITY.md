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
