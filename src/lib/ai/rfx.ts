import { callTool, deadlineIn, MODELS } from "./client";
import type { Attempt } from "./gemini";
import type { PreparedPart } from "../parsers";

export type RfxDraft = {
  title: string;
  description: string;
  category: string;
  currency: string;
  response_deadline: string | null;
  required_by: string | null;
  delivery_location: string | null;
  commercial_terms: { price_basis?: string; tax?: string; payment_terms?: string; validity_days?: number; freight?: string; notes?: string };
  line_items: { description: string; specification: string; quantity: number; uom: string; category: string }[];
  questionnaire: { question: string; answer_type: "yes_no" | "number" | "text"; must_pass: boolean; pass_op: "eq" | "gte" | "lte" | null; pass_value: string | number | boolean | null; requires_evidence: boolean }[];
  evaluation_criteria: { name: string; weight: number }[];
  suggested_supplier_ids: string[];
  assumptions: string[];
  open_questions: string[];
};

const SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    description: { type: "string", description: "Scope paragraph suppliers will read." },
    category: { type: "string" },
    currency: { type: "string", description: "ISO code, default INR" },
    response_deadline: { type: ["string", "null"], description: "YYYY-MM-DD" },
    required_by: { type: ["string", "null"], description: "YYYY-MM-DD" },
    delivery_location: { type: ["string", "null"] },
    commercial_terms: {
      type: "object",
      properties: {
        price_basis: { type: "string" },
        tax: { type: "string" },
        payment_terms: { type: "string" },
        validity_days: { type: "integer" },
        freight: { type: "string" },
        notes: { type: "string" },
      },
    },
    line_items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          description: { type: "string" },
          specification: { type: "string" },
          quantity: { type: "number" },
          uom: { type: "string", description: "pcs | sets | rolls | kg | m | litres | each" },
          category: { type: "string" },
        },
        required: ["description", "specification", "quantity", "uom"],
      },
    },
    questionnaire: {
      type: "array",
      items: {
        type: "object",
        properties: {
          question: { type: "string" },
          answer_type: { type: "string", enum: ["yes_no", "number", "text"] },
          must_pass: { type: "boolean" },
          pass_op: { type: ["string", "null"], enum: ["eq", "gte", "lte", null] },
          pass_value: { type: ["string", "number", "boolean", "null"] },
          requires_evidence: { type: "boolean" },
        },
        required: ["question", "answer_type", "must_pass"],
      },
    },
    evaluation_criteria: { type: "array", items: { type: "object", properties: { name: { type: "string" }, weight: { type: "number" } }, required: ["name", "weight"] } },
    suggested_supplier_ids: { type: "array", items: { type: "string" } },
    assumptions: { type: "array", items: { type: "string" }, description: "Everything you assumed that the buyer did not say (quantities, specs, dates)." },
    open_questions: { type: "array", items: { type: "string" }, description: "What the buyer should confirm before sending." },
  },
  required: ["title", "description", "category", "currency", "line_items", "questionnaire", "evaluation_criteria", "assumptions", "open_questions", "commercial_terms"],
};

export async function draftRfx(params: {
  brief: string;
  today: string;
  orgName: string;
  suppliers: { id: string; name: string; location: string | null }[];
  existingLines?: string | null;
  context?: Record<string, string | null | undefined>;
  answers?: { question: string; answer: string }[];
  parts?: PreparedPart[];
  /** Diagnostics only: override the model and observe each attempt. */
  diag?: { model?: string; trace?: Attempt[]; jsonOnly?: boolean; noFallback?: boolean; budgetSeconds?: number };
}) {
  const system = `You are an RFx co-pilot for an enterprise procurement team (${params.orgName}). Turn the buyer's plain-language requirement into a clear, sendable RFx draft.
- Be specific and supplier-readable: sizes, grades, construction, units of measure, quantities.
- If the buyer pasted a line list, keep their lines and quantities exactly; only clean up wording and add missing spec fields.
- If quantities or specs are not given, propose sensible ones AND list each as an assumption. Never hide an assumption.
- Questionnaire: 5–8 questions that matter for supplier qualification in this category; mark 2–4 as must-pass with a machine-checkable rule (eq true, gte N, lte N). Ask for evidence (certificates) where relevant.
- Commercial terms: price basis (delivered/ex-works), tax treatment (state GST separately), payment terms, validity, freight.
- Evaluation criteria weights must sum to 100.
- Suggest suppliers only from the provided list (by id) when they plausibly fit.
- Today is ${params.today}. Response deadline typically 7–12 days out; required-by date after that.`;
  const ctx = Object.entries(params.context ?? {}).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("\n");
  const ans = (params.answers ?? []).map((a) => `Q: ${a.question}\nA: ${a.answer}`).join("\n");
  const text = `Buyer requirement:\n"""${params.brief}"""\n\n${ctx ? `Context given by the buyer (use exactly):\n${ctx}\n\n` : ""}${ans ? `Clarifications the buyer answered:\n${ans}\n\n` : ""}${params.existingLines ? `Buyer's line list:\n${params.existingLines}\n\n` : ""}${params.parts?.length ? "Supporting documents from the buyer follow — if they contain a line list, specifications or a questionnaire, use them as the source of truth.\n\n" : ""}Available suppliers:\n${params.suppliers.map((s) => `${s.id} | ${s.name} | ${s.location ?? ""}`).join("\n") || "(none yet)"}`;
  const content: any[] = [{ type: "text", text }];
  for (const p of params.parts ?? []) {
    if (p.kind === "text") content.push({ type: "text", text: `DOCUMENT: ${p.label}\n${p.text.slice(0, 60000)}` });
    else if (p.kind === "pdf") content.push({ type: "text", text: `DOCUMENT: ${p.label}` }, { type: "document", source: { type: "base64", media_type: "application/pdf", data: p.base64 } });
    else content.push({ type: "text", text: `DOCUMENT: ${p.label}` }, { type: "image", source: { type: "base64", media_type: p.mediaType, data: p.base64 } });
  }
  return callTool<RfxDraft>({
    model: params.diag?.model ?? MODELS.analyst,
    trace: params.diag?.trace,
    jsonOnly: params.diag?.jsonOnly,
    noFallback: params.diag?.noFallback,
    system,
    content,
    tool: { name: "draft_rfx", description: "Return the editable RFx draft.", input_schema: SCHEMA },
    maxTokens: 12000,
    deadline: deadlineIn(params.diag?.budgetSeconds ?? 165), // route maxDuration is 180 s
  });
}


export type Clarification = { id: string; kind: "specs" | "quantity" | "delivery" | "quality" | "commercial" | "timeline"; title: string; detail: string; options: string[] };

/** Before drafting: what would a senior buyer ask? Returns at most 4 short, answerable questions. */
export async function clarifyRfx(params: { brief: string; context?: Record<string, string | null | undefined>; answers?: { question: string; answer: string }[]; hasDocs?: boolean }) {
  const ctx = Object.entries(params.context ?? {}).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("\n");
  const ans = (params.answers ?? []).map((a) => `Q: ${a.question} → ${a.answer}`).join("\n");
  const deadline = deadlineIn(50); // route maxDuration is 60 s
  const tryModel = async (model: string) =>
    callTool<{ summary: string; questions: Clarification[] }>({
      model,
      system: `You are a senior procurement buyer reviewing a colleague's RFx request before it is drafted. Identify only the gaps that would make supplier quotes non-comparable or the RFx weak: missing specifications (sizes, grade, ply, print), quantities, delivery terms (delivered vs ex-works, locations), quality/compliance criteria, commercial terms (payment, validity), timelines.
- Ask at most 4 questions, most important first. Skip anything already answered in the request, context or previous answers.${params.hasDocs ? " The buyer attached documents with likely specs/line items — don't ask for what a line list would contain." : ""}
- Each: a 3–6 word title, one short sentence of detail, and 2–4 concrete answer options the buyer can click (e.g. "Delivered price incl. freight", "Quote freight separately").
- summary: one sentence starting "I've read your request" saying what you understood.
- If nothing important is missing, return an empty questions list.`,
      content: `Request: """${params.brief}"""\n${ctx ? `Context:\n${ctx}\n` : ""}${ans ? `Already answered:\n${ans}` : ""}`,
      tool: {
        name: "clarify",
        description: "Return clarifying questions.",
        input_schema: {
          type: "object",
          properties: {
            summary: { type: "string" },
            questions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  kind: { type: "string", enum: ["specs", "quantity", "delivery", "quality", "commercial", "timeline"] },
                  title: { type: "string" },
                  detail: { type: "string" },
                  options: { type: "array", items: { type: "string" } },
                },
                required: ["id", "kind", "title", "detail", "options"],
              },
            },
          },
          required: ["summary", "questions"],
        },
      },
      maxTokens: 1500,
      deadline,
    });
  try {
    return await tryModel(MODELS.fast);
  } catch {
    return await tryModel(MODELS.analyst);
  }
}
