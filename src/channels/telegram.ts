import type { Agent } from "../core/agent.js";

type TelegramOptions = {
  token?: string;
  /** Chat ids allowed to talk to the bot. Empty = anyone. */
  allowedChats?: string[];
};

const API = (token: string, method: string) => `https://api.telegram.org/bot${token}/${method}`;

async function call(token: string, method: string, body: Record<string, unknown>) {
  const res = await fetch(API(token, method), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json() as Promise<{ ok: boolean; result?: any; description?: string }>;
}

/**
 * Telegram channel via long-polling (getUpdates) — no public webhook needed, so
 * it runs anywhere (laptop, a worker, a box behind NAT). Each chat id is its own
 * memory session. Returns a stop() function.
 */
export function startTelegram(agent: Agent, opts: TelegramOptions = {}) {
  const token = opts.token || process.env.TELEGRAM_BOT_TOKEN || "";
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is required");
  const allowed = opts.allowedChats ?? (process.env.TELEGRAM_ALLOWED_CHATS || "").split(",").map((s) => s.trim()).filter(Boolean);

  let offset = 0;
  let running = true;

  async function loop() {
    console.log("telegram channel polling…");
    while (running) {
      try {
        const upd = await call(token, "getUpdates", { offset, timeout: 25, allowed_updates: ["message"] });
        for (const u of upd.result ?? []) {
          offset = u.update_id + 1;
          const msg = u.message;
          const text: string = msg?.text?.trim();
          const chatId = String(msg?.chat?.id ?? "");
          if (!text || !chatId) continue;
          if (allowed.length && !allowed.includes(chatId)) {
            await call(token, "sendMessage", { chat_id: chatId, text: "Not authorized." });
            continue;
          }
          await call(token, "sendChatAction", { chat_id: chatId, action: "typing" });
          try {
            const r = await agent.run(text, { sessionId: `tg-${chatId}`, state: { channel: "telegram", chatId } });
            await call(token, "sendMessage", { chat_id: chatId, text: r.text || "(no reply)" });
          } catch (err) {
            await call(token, "sendMessage", { chat_id: chatId, text: `Error: ${String(err)}` });
          }
        }
      } catch (err) {
        console.error("telegram poll error", err);
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  }
  loop();
  return () => {
    running = false;
  };
}
