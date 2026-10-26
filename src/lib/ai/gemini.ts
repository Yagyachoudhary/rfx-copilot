/**
 * Google Gemini adapter. Mirrors what the Anthropic path does so the rest of the app is provider-agnostic:
 * structured output via one forced function call, and native PDF / image input.
 *
 * Note on data: on Google's free (unpaid) tier, prompts and responses may be used to improve Google's
 * products and may be read by human reviewers. Use it with demo data only; use a paid key for real quotes.
 */
import { FunctionCallingConfigMode, GoogleGenAI, type Content, type Part } from "@google/genai";

let _client: GoogleGenAI | null = null;
export function gemini() {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set on the server. Add it to the environment and redeploy.");
  if (!_client) {
    _client = new GoogleGenAI({
      apiKey: key,
      // Lets tests point the SDK at a local mock; unset in normal use.
      ...(process.env.GEMINI_BASE_URL ? { httpOptions: { baseUrl: process.env.GEMINI_BASE_URL } } : {}),
    });
  }
  return _client;
}

/** Anthropic-style content (string or blocks) → Gemini parts. */
export function toGeminiParts(content: any): Part[] {
  if (typeof content === "string") return [{ text: content }];
  const parts: Part[] = [];
  for (const b of content ?? []) {
    if (b.type === "text") parts.push({ text: b.text });
    else if ((b.type === "image" || b.type === "document") && b.source?.type === "base64") {
      parts.push({ inlineData: { mimeType: b.source.media_type, data: b.source.data } });
    }
  }
  return parts;
}

/** JSON Schema as written for Anthropic tools → a form Gemini's parametersJsonSchema accepts. */
export function toGeminiSchema(schema: any): any {
  if (Array.isArray(schema)) return schema.map(toGeminiSchema);
  if (!schema || typeof schema !== "object") return schema;
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(schema)) {
    if (k === "additionalProperties" || k === "$schema") continue;
    out[k] = typeof v === "object" ? toGeminiSchema(v) : v;
  }
  return out;
}

function usageOf(res: any) {
  return { input: res?.usageMetadata?.promptTokenCount ?? 0, output: (res?.usageMetadata?.candidatesTokenCount ?? 0) + (res?.usageMetadata?.thoughtsTokenCount ?? 0) };
}

function finishReason(res: any): string | null {
  return res?.candidates?.[0]?.finishReason ?? null;
}

function friendlyError(e: any): Error {
  const m = String(e?.message ?? e);
  if (/429|RESOURCE_EXHAUSTED|quota/i.test(m)) return new Error("Gemini's free daily limit has been reached. Try again later, or switch AI_PROVIDER back to anthropic.");
  if (/503|UNAVAILABLE|overloaded|high demand/i.test(m)) return new Error("Gemini is busy right now (high demand on Google's side). Please try again in a minute.");
  return e instanceof Error ? e : new Error(m);
}

const busy = (e: any) => /503|UNAVAILABLE|overloaded|high demand|500|INTERNAL/i.test(String(e?.message ?? e));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * generateContent with resilience for the free tier: retries "busy" errors (503) with backoff,
 * then falls back to Flash-Lite before giving up with a plain-language message.
 */
async function generate(model: string, request: Record<string, any>) {
  const fallback = process.env.AI_MODEL_FALLBACK || "gemini-flash-lite-latest";
  const models = model === fallback ? [model] : [model, fallback];
  let last: any;
  for (const m of models) {
    for (const wait of [0, 2000, 5000]) {
      if (wait) await sleep(wait);
      try {
        return await gemini().models.generateContent({ model: m, ...request } as any);
      } catch (e) {
        last = e;
        if (!busy(e)) throw friendlyError(e);
      }
    }
  }
  throw friendlyError(last);
}

export async function geminiCallTool<T>(opts: {
  model: string;
  system: string;
  content: any;
  tool: { name: string; description: string; input_schema: Record<string, any> };
  maxTokens?: number;
}): Promise<{ input: T; usage: { input: number; output: number }; stopReason: string | null }> {
  const usage = { input: 0, output: 0 };
  const contents: Content[] = [{ role: "user", parts: toGeminiParts(opts.content) }];
  for (let attempt = 0; attempt < 2; attempt++) {
    const res: any = await generate(opts.model, {
        contents,
        config: {
          systemInstruction: opts.system,
          maxOutputTokens: opts.maxTokens ?? 8000,
          tools: [{ functionDeclarations: [{ name: opts.tool.name, description: opts.tool.description, parametersJsonSchema: toGeminiSchema(opts.tool.input_schema) }] }],
          toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.ANY, allowedFunctionNames: [opts.tool.name] } },
        },
      });
    const u = usageOf(res);
    usage.input += u.input;
    usage.output += u.output;
    if (finishReason(res) === "MAX_TOKENS") throw new Error("The AI response was cut off (too long). Try again, or split the document.");
    const call = (res.functionCalls ?? []).find((c: any) => c.name === opts.tool.name);
    if (call?.args) return { input: call.args as T, usage, stopReason: finishReason(res) };
    const text: string = res.text ?? "";
    if (text.includes("{")) {
      try {
        const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        return { input: JSON.parse(fenced ? fenced[1] : text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as T, usage, stopReason: finishReason(res) };
      } catch {
        /* nudge below */
      }
    }
    const candidate = res.candidates?.[0]?.content;
    if (candidate) contents.push(candidate);
    contents.push({ role: "user", parts: [{ text: `Please call the ${opts.tool.name} function now with the complete result.` }] });
  }
  throw new Error("The AI did not return a structured result. Please retry.");
}

/** One step of a multi-turn tool loop (used by the Analyst). */
export async function geminiStep(opts: { model: string; system: string; contents: Content[]; tools: { name: string; description: string; input_schema: any }[]; maxTokens?: number }) {
  const res: any = await generate(opts.model, {
      contents: opts.contents,
      config: {
        systemInstruction: opts.system,
        maxOutputTokens: opts.maxTokens ?? 4000,
        tools: [{ functionDeclarations: opts.tools.map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: toGeminiSchema(t.input_schema) })) }],
        toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO } },
      },
    });
  return {
    // The model's turn exactly as returned (keeps thought signatures that Gemini needs on the next turn).
    content: (res.candidates?.[0]?.content ?? { role: "model", parts: [{ text: res.text ?? "" }] }) as Content,
    calls: (res.functionCalls ?? []) as { id?: string; name: string; args: any }[],
    text: (res.text ?? "") as string,
    usage: usageOf(res),
  };
}
