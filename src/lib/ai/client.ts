import Anthropic from "@anthropic-ai/sdk";
import { deadlineIn, geminiCallTool, type Attempt } from "./gemini";
export { deadlineIn };

/**
 * Which model provider runs the AI features. AI_PROVIDER=gemini switches drafting, clarifying questions,
 * extraction and the Analyst to Google Gemini; anything else (default) uses Anthropic Claude.
 */
export const PROVIDER: "anthropic" | "gemini" = (process.env.AI_PROVIDER || "").toLowerCase() === "gemini" ? "gemini" : "anthropic";

const DEFAULTS = {
  anthropic: { extraction: "claude-sonnet-5-5", analyst: "claude-sonnet-5-5", fast: "claude-haiku-5-5" },
  // Flash-Lite by default: on the free tier the bigger Flash model is often overloaded (503) and has a much
  // smaller quota (429), while Flash-Lite answers in seconds. Set AI_MODEL_* to gemini-flash-latest for
  // higher quality on a paid key.
  gemini: { extraction: "gemini-flash-lite-latest", analyst: "gemini-flash-lite-latest", fast: "gemini-flash-lite-latest" },
}[PROVIDER];

export const MODELS = {
  extraction: process.env.AI_MODEL_EXTRACTION || DEFAULTS.extraction,
  analyst: process.env.AI_MODEL_ANALYST || DEFAULTS.analyst,
  fast: process.env.AI_MODEL_FAST || DEFAULTS.fast,
};

export function aiConfigured() {
  return PROVIDER === "gemini" ? Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) : Boolean(process.env.ANTHROPIC_API_KEY);
}

let _client: Anthropic | null = null;
export function anthropic() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set on the server. Add it to the environment and redeploy.");
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 280_000 });
  return _client;
}

/** Repairs a known glitch where a nested object arrives as a string like '\n<parameter name="code">INR'. */
export function repairInput(v: any): any {
  if (Array.isArray(v)) return v.map(repairInput);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, repairInput(x)]));
  if (typeof v === "string" && v.includes("<parameter name=")) {
    const out: Record<string, any> = {};
    for (const m of v.matchAll(/<parameter name="([^"]+)">([\s\S]*?)(?=<\/parameter>|<parameter name=|$)/g)) {
      const raw = m[2].trim();
      out[m[1]] = raw === "null" ? null : /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : raw === "true" ? true : raw === "false" ? false : raw;
    }
    return Object.keys(out).length ? out : v;
  }
  return v;
}

function extractJson(text: string): any {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  return JSON.parse(raw);
}

/**
 * Structured output via a tool call. Newer models reject forced tool_choice, so we offer the tool with
 * tool_choice "auto" plus an explicit instruction, nudge once if the model answers in prose, and as a last
 * resort parse JSON from the text. Works across model generations.
 */
export async function callTool<T>(opts: {
  model: string;
  system: string;
  content: Anthropic.MessageParam["content"];
  tool: { name: string; description: string; input_schema: Record<string, any> };
  maxTokens?: number;
  /** Epoch ms by which the call must finish (Gemini path); see deadlineIn(). */
  deadline?: number;
  /** Gemini only: diagnostics hooks, see gemini.ts. */
  trace?: Attempt[];
  jsonOnly?: boolean;
  noFallback?: boolean;
}): Promise<{ input: T; usage: { input: number; output: number }; stopReason: string | null }> {
  if (PROVIDER === "gemini") return geminiCallTool<T>(opts);
  const system = `${opts.system}\n\nReturn your result ONLY by calling the \`${opts.tool.name}\` tool exactly once with the complete input. Do not answer in prose.`;
  const tools = [{ name: opts.tool.name, description: opts.tool.description, input_schema: opts.tool.input_schema as any }];
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: opts.content }];
  const usage = { input: 0, output: 0 };
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await anthropic().messages.create({ model: opts.model, max_tokens: opts.maxTokens ?? 8000, system, tools, tool_choice: { type: "auto" }, messages });
    usage.input += res.usage?.input_tokens ?? 0;
    usage.output += res.usage?.output_tokens ?? 0;
    if (res.stop_reason === "max_tokens") throw new Error("The AI response was cut off (too long). Try again, or split the document.");
    const block = res.content.find((b: any) => b.type === "tool_use" && b.name === opts.tool.name) as any;
    if (block) return { input: repairInput(block.input) as T, usage, stopReason: res.stop_reason ?? null };
    const text = res.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
    try {
      if (text.includes("{")) return { input: extractJson(text) as T, usage, stopReason: res.stop_reason ?? null };
    } catch {
      /* fall through to a nudge */
    }
    messages.push({ role: "assistant", content: res.content as any }, { role: "user", content: `Please call the ${opts.tool.name} tool now with the complete result.` });
  }
  throw new Error("The AI did not return a structured result. Please retry.");
}
