import Anthropic from "@anthropic-ai/sdk";

export const MODELS = {
  extraction: process.env.AI_MODEL_EXTRACTION || "claude-sonnet-5-5",
  analyst: process.env.AI_MODEL_ANALYST || "claude-sonnet-5-5",
  fast: process.env.AI_MODEL_FAST || "claude-haiku-5-5",
};

export function aiConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

let _client: Anthropic | null = null;
export function anthropic() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set on the server. Add it to the environment and redeploy.");
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 280_000 });
  return _client;
}

/** Force a single tool call and return its validated input. */
export async function callTool<T>(opts: {
  model: string;
  system: string;
  content: Anthropic.MessageParam["content"];
  tool: { name: string; description: string; input_schema: Record<string, any> };
  maxTokens?: number;
}): Promise<{ input: T; usage: { input: number; output: number }; stopReason: string | null }> {
  const res = await anthropic().messages.create({
    model: opts.model,
    max_tokens: opts.maxTokens ?? 8000,
    system: opts.system,
    tools: [{ name: opts.tool.name, description: opts.tool.description, input_schema: opts.tool.input_schema as any }],
    tool_choice: { type: "tool", name: opts.tool.name },
    messages: [{ role: "user", content: opts.content }],
  });
  const block = res.content.find((b: any) => b.type === "tool_use") as any;
  if (!block) throw new Error(`Model did not return structured output (stop: ${res.stop_reason})`);
  if (res.stop_reason === "max_tokens") throw new Error("Model output was truncated (max_tokens). Try again or split the document.");
  return {
    input: block.input as T,
    usage: { input: res.usage?.input_tokens ?? 0, output: res.usage?.output_tokens ?? 0 },
    stopReason: res.stop_reason ?? null,
  };
}
