/**
 * HTTP agent server with a custom tool. Run: `npm run serve`.
 *   curl -XPOST localhost:8787/chat -d '{"message":"price of bitcoin?"}'
 *   curl -N -XPOST localhost:8787/chat/stream -d '{"message":"research the latest on X"}'
 */
import { assistant } from "../src/recipes/assistant.js";
import { defineTool } from "../src/core/tool.js";
import { serve } from "../src/channels/web.js";

// a tiny custom tool, to show how you extend the agent
const flipCoin = defineTool({
  name: "flip_coin",
  description: "Flip a fair coin. Returns heads or tails.",
  input: { type: "object", properties: {} },
  handler: () => (Date.now() % 2 ? "heads" : "tails"),
});

const agent = assistant({ tools: [flipCoin] });
serve(agent);
