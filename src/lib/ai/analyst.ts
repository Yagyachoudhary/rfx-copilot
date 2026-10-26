import type Anthropic from "@anthropic-ai/sdk";
import type { Database } from "sql.js";
import { anthropic, MODELS, PROVIDER } from "./client";
import { geminiStep } from "./gemini";
import type { Content } from "@google/genai";
import { ANALYST_SCHEMA, runReadOnly } from "../analysis-db";
import type { RfqBundle } from "../data";

export type AnalystEvent =
  | { type: "status"; text: string }
  | { type: "sql"; id: string; purpose: string; query: string; columns: string[]; rows: any[][]; truncated: boolean; error?: string }
  | { type: "chart"; id: string; title: string; chartType: "bar" | "line"; x: string; y: string[]; data: Record<string, any>[]; query: string; yLabel?: string }
  | { type: "export"; id: string; fileName: string; url: string | null; rows: number; query: string }
  | { type: "text"; text: string }
  | { type: "error"; text: string }
  | { type: "done" };

const TOOLS: Anthropic.Tool[] = [
  {
    name: "run_sql",
    description:
      "Run one read-only SQLite SELECT/WITH query over the current RFx snapshot. Use this for EVERY number you state. Returns columns and rows (max 200).",
    input_schema: {
      type: "object",
      properties: {
        purpose: { type: "string", description: "One short line shown to the buyer: what this query computes." },
        query: { type: "string" },
      },
      required: ["purpose", "query"],
    },
  },
  {
    name: "make_chart",
    description: "Render a bar or line chart for the buyer. The data comes from running `query`; never pass numbers directly.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        chart_type: { type: "string", enum: ["bar", "line"] },
        query: { type: "string", description: "SELECT returning the x column and one or more numeric y columns (max ~40 rows)." },
        x: { type: "string" },
        y: { type: "array", items: { type: "string" } },
        y_label: { type: "string" },
      },
      required: ["title", "chart_type", "query", "x", "y"],
    },
  },
  {
    name: "export_table",
    description: "Create a downloadable XLSX or CSV from a query result. Returns a link the buyer can download.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string" },
        file_name: { type: "string", description: "e.g. comparison_RFQ-0142.xlsx" },
        format: { type: "string", enum: ["xlsx", "csv"] },
        title: { type: "string" },
      },
      required: ["query", "file_name", "format"],
    },
  },
];

export function analystSystemPrompt(b: RfqBundle) {
  const rates = Object.entries(b.rfq.currency_policy?.rates ?? {})
    .map(([c, r]) => `${c}→${b.rfq.currency} ${r.rate} (as of ${r.as_of}, ${r.source})`)
    .join("; ");
  const must = b.questions.filter((q) => q.must_pass).map((q) => `Q${q.q_no} ${q.question} rule ${JSON.stringify(q.pass_rule)}`).join("\n  ");
  return `You are the sourcing analyst inside a procurement platform, helping a buyer evaluate RFx ${b.rfq.ref_code} "${b.rfq.title}" (${b.lines.length} lines, base currency ${b.rfq.currency}).
Suppliers invited: ${b.suppliers.map((s) => s.name).join(", ")}.
Currency policy: ${rates || "none"}. Qualification: ${b.rfq.evaluation_rules?.qualification ?? "all must-pass questions"}
Must-pass questions:
  ${must || "none"}

You can query a read-only SQLite snapshot of the CURRENT reviewed data (active response versions, normalized values incl. buyer corrections):
${ANALYST_SCHEMA}

How to answer:
- Every number you state must come from a run_sql result in this conversation. Do the arithmetic in SQL (SUM, MIN, CASE, window functions), not in your head.
- Missing quotes are NOT zero. A supplier's total over different line sets is not comparable; for "lowest cost" compare on a common basket (lines comparable for every supplier in scope) and say which lines were excluded and why.
- Only rows with comparable = 1 have a normalized price. Rows in state needs_review/conflict have raw values but are not comparable; mention them as exclusions.
- "Qualified" means qualification IN ('qualified_verified','qualified_claimed'); say clearly when qualification rests on unverified supplier claims.
- Call out values with low_confidence = 1, outlier = 1, tax_treatment = 'unknown' or has_override = 1 when they affect the answer.
- Show the calculation: a compact markdown table of the key rows, then a 2–4 sentence conclusion with assumptions and exclusions. Use ₹ with Indian digit grouping.
- Use make_chart when a visual comparison helps (e.g. totals by supplier). Use export_table when the buyer asks for a file.
- You advise; the buyer decides. Never say a supplier "is awarded". If data is insufficient, say exactly what is missing and what to request.
- If you cannot compute something from the tables, say so — do not guess.`;
}

export async function runAnalyst(opts: {
  bundle: RfqBundle;
  db: Database;
  history: { role: "user" | "assistant"; content: string }[];
  question: string;
  emit: (e: AnalystEvent) => void;
  exportFile: (fileName: string, format: "xlsx" | "csv", columns: string[], rows: any[][], title?: string) => Promise<{ url: string | null; fileName: string }>;
}) {
  const { bundle, db, emit } = opts;
  const system = analystSystemPrompt(bundle);
  let n = 0;

  /** Runs one tool call and returns what goes back to the model. Shared by both providers. */
  async function runTool(name: string, input: any): Promise<{ content: string; isError: boolean }> {
    const id = `t${++n}`;
    try {
      if (name === "run_sql") {
        const r = runReadOnly(db, input.query);
        emit({ type: "sql", id, purpose: input.purpose, query: input.query, columns: r.columns, rows: r.rows.slice(0, 60), truncated: r.truncated || r.rows.length > 60 });
        return { content: JSON.stringify({ columns: r.columns, rows: r.rows, truncated: r.truncated }), isError: false };
      }
      if (name === "make_chart") {
        const r = runReadOnly(db, input.query, 60);
        const data = r.rows.map((row) => Object.fromEntries(r.columns.map((c, i) => [c, row[i]])));
        const ys = ((input.y ?? []) as string[]).filter((y) => r.columns.includes(y));
        if (!r.columns.includes(input.x) || !ys.length) throw new Error(`Chart columns not in query result (got ${r.columns.join(", ")})`);
        emit({ type: "chart", id, title: input.title, chartType: input.chart_type, x: input.x, y: ys, data, query: input.query, yLabel: input.y_label });
        return { content: `Chart rendered for the buyer with ${data.length} points.`, isError: false };
      }
      if (name === "export_table") {
        const r = runReadOnly(db, input.query, 5000);
        const fmt = input.format === "csv" ? "csv" : "xlsx";
        let fileName = String(input.file_name || `export.${fmt}`);
        if (!fileName.endsWith(`.${fmt}`)) fileName = `${fileName.replace(/\.\w+$/, "")}.${fmt}`;
        const out = await opts.exportFile(fileName, fmt, r.columns, r.rows, input.title);
        emit({ type: "export", id, fileName: out.fileName, url: out.url, rows: r.rows.length, query: input.query });
        return { content: `Export created: ${out.fileName} (${r.rows.length} rows). The buyer sees a download link.`, isError: false };
      }
      throw new Error(`Unknown tool ${name}`);
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      if (name === "run_sql") emit({ type: "sql", id, purpose: input?.purpose ?? "", query: input?.query ?? "", columns: [], rows: [], truncated: false, error: msg });
      return { content: `Error: ${msg}`, isError: true };
    }
  }

  if (PROVIDER === "gemini") {
    const contents: Content[] = [
      ...opts.history.slice(-12).map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }) as Content),
      { role: "user", parts: [{ text: opts.question }] },
    ];
    for (let step = 0; step < 10; step++) {
      emit({ type: "status", text: step === 0 ? "Reading the current RFx data…" : "Working through the numbers…" });
      const r = await geminiStep({ model: MODELS.analyst, system, contents, tools: TOOLS as any });
      contents.push(r.content);
      if (!r.calls.length) {
        const text = r.text.trim();
        emit({ type: "text", text: text || "(no answer)" });
        return text;
      }
      const parts: any[] = [];
      for (const c of r.calls) {
        const out = await runTool(c.name, c.args ?? {});
        parts.push({ functionResponse: { ...(c.id ? { id: c.id } : {}), name: c.name, response: out.isError ? { error: out.content } : { result: out.content } } });
      }
      contents.push({ role: "user", parts });
    }
  } else {
    const messages: Anthropic.MessageParam[] = [
      ...opts.history.slice(-12).map((m) => ({ role: m.role, content: m.content }) as Anthropic.MessageParam),
      { role: "user", content: opts.question },
    ];
    for (let step = 0; step < 10; step++) {
      emit({ type: "status", text: step === 0 ? "Reading the current RFx data…" : "Working through the numbers…" });
      const res = await anthropic().messages.create({ model: MODELS.analyst, max_tokens: 4000, system, tools: TOOLS, messages });
      messages.push({ role: "assistant", content: res.content as any });
      const toolUses = res.content.filter((c: any) => c.type === "tool_use") as Anthropic.ToolUseBlock[];
      if (!toolUses.length || res.stop_reason !== "tool_use") {
        const text = res.content.filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n").trim();
        emit({ type: "text", text: text || "(no answer)" });
        return text;
      }
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        const out = await runTool(tu.name, tu.input as any);
        results.push({ type: "tool_result", tool_use_id: tu.id, content: out.content, ...(out.isError ? { is_error: true } : {}) });
      }
      messages.push({ role: "user", content: results });
    }
  }
  const msg = "I stopped after 10 steps without a final answer. Try narrowing the question.";
  emit({ type: "text", text: msg });
  return msg;
}
