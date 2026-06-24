import { defineTool } from "../core/tool.js";

/** Current date/time — the model has no clock of its own. */
export const now = defineTool<{ timezone?: string }>({
  name: "now",
  description: "Get the current date and time. Optionally in a given IANA timezone (e.g. 'Asia/Jakarta').",
  input: {
    type: "object",
    properties: { timezone: { type: "string", description: "IANA timezone, default UTC." } },
  },
  handler({ timezone }) {
    const d = new Date();
    try {
      return {
        iso: d.toISOString(),
        local: timezone ? d.toLocaleString("en-US", { timeZone: timezone }) : d.toUTCString(),
        timezone: timezone ?? "UTC",
        unix: Math.floor(d.getTime() / 1000),
      };
    } catch {
      return { iso: d.toISOString(), error: `Unknown timezone: ${timezone}` };
    }
  },
});
