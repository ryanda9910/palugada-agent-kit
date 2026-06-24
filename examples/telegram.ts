/**
 * Telegram bot in ~5 lines. Run: `npm run telegram` (needs TELEGRAM_BOT_TOKEN).
 * Each chat gets its own persistent memory session.
 */
import { assistant } from "../src/recipes/assistant.js";
import { startTelegram } from "../src/channels/telegram.js";

const agent = assistant();
startTelegram(agent);
console.log("Telegram agent running. Message your bot.");
