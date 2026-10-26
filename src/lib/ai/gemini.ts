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
 * Time budget for one AI feature. Vercel stops a function at its maxDuration and returns a plain-text error
 * page, so we stop earlier and return a readable message instead. Each route passes a budget below its
 * maxDuration; AI_TIME_BUDGET_SECONDS can lower them all (e.g. on a plan with a shorter limit).
 */
export function deadlineIn(seconds = 150) {
  const cap = Number(process.env.AI_TIME_BUDGET_SECONDS) || Infinity;
  return Date.now() + Math.min(seconds, cap) * 1000;
}

/** Keep Gemini's "thinking" short: much faster, and enough for drafting and reading quotes. AI_GEMINI_THINKING=off|low|medium|high. */
function thinkingConfig() {
  const level = (process.env.AI_GEMINI_THINKING || "low").toUpperCase();
  return level === "OFF" || level === "DEFAULT" ? undefined : { thinkingLevel: level };
}

/** Gemini counts thinking tokens against the output limit, so leave room for them. */
const withThinkingRoom = (n: number) => (thinkingConfig() ? n + 4000 : n);

const tooSlow = () =>
  new Error("The AI took too long to respond (Google's servers may be busy). Please try again in a minute.");

/** One attempt against Gemini, for diagnosing slow or failing calls (server logs and /api/ai/diagnose). */
export type Attempt = { model: string; ms: number; outcome: "ok" | "busy" | "error" | "timeout" | "thinking-rejected"; detail?: string; finishReason?: string | null; outputTokens?: number; modelVersion?: string };
export const traceText = (t: Attempt[]) => t.map((a) => `${a.model} ${a.outcome} in ${(a.ms / 1000).toFixed(1)}s${a.finishReason ? ` (${a.finishReason}, ${a.outputTokens ?? 0} tokens out)` : ""}${a.detail ? `: ${a.detail.slice(0, 160)}` : ""}`).join(" | ");

/**
 * generateContent with resilience for the free tier: retries "busy" errors (503) with backoff,
 * then falls back to Flash-Lite, all within a deadline, before giving up with a plain-language message.
 */
async function generate(model: string, request: Record<string, any>, deadline = deadlineIn(), trace: Attempt[] = [], noFallback = false) {
  const fallback = process.env.AI_MODEL_FALLBACK || "gemini-flash-lite-latest";
  const models = model === fallback || noFallback ? [model] : [model, fallback];
  const thinking = thinkingConfig();
  let useThinking = Boolean(thinking);
  let last: any;
  for (const m of models) {
    for (const wait of [0, 2000, 5000]) {
      if (wait) await sleep(wait);
      const remaining = deadline - Date.now();
      if (remaining < 8000) {
        console.error("[gemini]", traceText(trace));
        throw last && !busy(last) ? friendlyError(last) : tooSlow();
      }
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), remaining);
      const t0 = Date.now();
      try {
        const config = { ...(request.config ?? {}), abortSignal: ac.signal, ...(useThinking ? { thinkingConfig: thinking } : {}) };
        const res: any = await gemini().models.generateContent({ model: m, ...request, config } as any);
        trace.push({ model: m, ms: Date.now() - t0, outcome: "ok", finishReason: res?.candidates?.[0]?.finishReason ?? null, outputTokens: usageOf(res).output, modelVersion: res?.modelVersion });
        return res;
      } catch (e: any) {
        last = e;
        const detail = String(e?.message ?? e);
        if (ac.signal.aborted) {
          trace.push({ model: m, ms: Date.now() - t0, outcome: "timeout" });
          console.error("[gemini]", traceText(trace));
          throw tooSlow();
        }
        // Older models reject the thinking setting: drop it and retry straight away.
        if (useThinking && /thinking/i.test(detail)) {
          trace.push({ model: m, ms: Date.now() - t0, outcome: "thinking-rejected", detail });
          useThinking = false;
          continue;
        }
        trace.push({ model: m, ms: Date.now() - t0, outcome: busy(e) ? "busy" : "error", detail });
        if (!busy(e)) {
          console.error("[gemini]", traceText(trace));
          throw friendlyError(e);
        }
      } finally {
        clearTimeout(timer);
      }
    }
  }
  console.error("[gemini]", traceText(trace));
  throw friendlyError(last);
}

export async function geminiCallTool<T>(opts: {
  model: string;
  system: string;
  content: any;
  tool: { name: string; description: string; input_schema: Record<string, any> };
  maxTokens?: number;
  deadline?: number;
  trace?: Attempt[];
  /** Skip the function-call attempt and ask for JSON directly (for diagnostics). */
  jsonOnly?: boolean;
  /** Don't fall back to Flash-Lite (for diagnostics). */
  noFallback?: boolean;
}): Promise<{ input: T; usage: { input: number; output: number }; stopReason: string | null }> {
  const trace = opts.trace ?? [];
  const usage = { input: 0, output: 0 };
  const deadline = opts.deadline ?? deadlineIn();
  const contents: Content[] = [{ role: "user", parts: toGeminiParts(opts.content) }];
  const schema = toGeminiSchema(opts.tool.input_schema);
  for (let attempt = 0; attempt < 2; attempt++) {
    // First try a forced function call. If Gemini returns nothing usable (it sometimes reports
    // MALFORMED_FUNCTION_CALL on large schemas), the second try asks for plain JSON matching the same schema.
    const jsonMode = attempt > 0 || Boolean(opts.jsonOnly);
    if (opts.jsonOnly && attempt > 0) break;
    const res: any = await generate(
      opts.model,
      {
        contents: jsonMode ? [{ role: "user", parts: toGeminiParts(opts.content) }] : contents,
        config: jsonMode
          ? { systemInstruction: opts.system, maxOutputTokens: withThinkingRoom(opts.maxTokens ?? 8000), responseMimeType: "application/json", responseJsonSchema: schema }
          : {
              systemInstruction: opts.system,
              maxOutputTokens: withThinkingRoom(opts.maxTokens ?? 8000),
              tools: [{ functionDeclarations: [{ name: opts.tool.name, description: opts.tool.description, parametersJsonSchema: schema }] }],
              toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.ANY, allowedFunctionNames: [opts.tool.name] } },
            },
      },
      deadline,
      trace,
      opts.noFallback,
    );
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
        /* try plain JSON mode next */
      }
    }
  }
  console.error("[gemini] no structured result:", traceText(trace));
  throw new Error("The AI did not return a structured result. Please retry.");
}

/** One step of a multi-turn tool loop (used by the Analyst). */
export async function geminiStep(opts: { model: string; system: string; contents: Content[]; tools: { name: string; description: string; input_schema: any }[]; maxTokens?: number; deadline?: number }) {
  const res: any = await generate(opts.model, {
      contents: opts.contents,
      config: {
        systemInstruction: opts.system,
        maxOutputTokens: withThinkingRoom(opts.maxTokens ?? 4000),
        tools: [{ functionDeclarations: opts.tools.map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: toGeminiSchema(t.input_schema) })) }],
        toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO } },
      },
    }, opts.deadline);
  return {
    // The model's turn exactly as returned (keeps thought signatures that Gemini needs on the next turn).
    content: (res.candidates?.[0]?.content ?? { role: "model", parts: [{ text: res.text ?? "" }] }) as Content,
    calls: (res.functionCalls ?? []) as { id?: string; name: string; args: any }[],
    text: (res.text ?? "") as string,
    usage: usageOf(res),
  };
}

/** One quick call to a model, no retries or fallback: is it reachable, and how fast? */
export async function pingModel(model: string): Promise<Attempt> {
  const trace: Attempt[] = [];
  try {
    await generate(model, { contents: [{ role: "user", parts: [{ text: "Reply with the single word OK." }] }], config: { maxOutputTokens: withThinkingRoom(20) } }, deadlineIn(30), trace, true);
  } catch {
    /* recorded in trace */
  }
  // Only the last attempt matters (the first may be a rejected thinking setting).
  return trace[trace.length - 1] ?? { model, ms: 0, outcome: "error", detail: "no attempt made" };
}
