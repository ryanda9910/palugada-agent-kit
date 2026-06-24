/**
 * Customer-support bot grounded in a KB, with human escalation gated by an
 * approval policy. Run: `tsx examples/support.ts`.
 */
import { supportBot } from "../src/recipes/support.js";
import { runCLI } from "../src/channels/cli.js";

const agent = supportBot(
  [
    { q: "refund policy", a: "Refunds within 14 days of purchase, no questions asked. Email billing@example.com." },
    { q: "reset password", a: "Use the 'Forgot password' link on the login page; the reset email arrives in ~2 min." },
    { q: "pricing", a: "Core is $99 one-time, Full is $199 one-time. Both include lifetime updates." },
  ],
  {
    brand: "Palu Gada Agent Kit",
    escalate: async (summary) => console.log("\n[ESCALATION → human]", summary, "\n"),
  },
);
// escalate_to_human is a `dangerous` tool — by default onApprove() allows it.
// In production pass `onApprove` to supportBot(...) to gate on a policy or human.

await runCLI(agent, { sessionId: "support-demo", greeting: "Support bot ready. Ask about refunds, pricing, password…" });
