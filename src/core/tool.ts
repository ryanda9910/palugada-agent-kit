import type { JSONSchema, Tool, ToolContext } from "./types.js";

/**
 * Define a tool with full type-safety on the input. Pass a JSON Schema for
 * `input` and the handler receives it typed as `I`.
 *
 * @example
 * const weather = defineTool<{ city: string }>({
 *   name: "get_weather",
 *   description: "Get the current weather for a city.",
 *   input: { type: "object", properties: { city: { type: "string" } }, required: ["city"] },
 *   handler: async ({ city }) => `It is 28°C in ${city}.`,
 * });
 */
export function defineTool<I = Record<string, unknown>>(def: {
  name: string;
  description: string;
  input: JSONSchema;
  dangerous?: boolean;
  handler: (input: I, ctx: ToolContext) => Promise<unknown> | unknown;
}): Tool<I> {
  return {
    name: def.name,
    description: def.description,
    input_schema: def.input,
    dangerous: def.dangerous,
    handler: def.handler,
  };
}

/** Shrink any handler return value into the string Anthropic expects in a tool_result. */
export function stringifyToolResult(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
