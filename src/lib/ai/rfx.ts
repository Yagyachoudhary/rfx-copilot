import { callTool, MODELS } from "./client";

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
  const content = `Buyer requirement:\n"""${params.brief}"""\n\n${params.existingLines ? `Buyer's line list:\n${params.existingLines}\n\n` : ""}Available suppliers:\n${params.suppliers.map((s) => `${s.id} | ${s.name} | ${s.location ?? ""}`).join("\n") || "(none yet)"}`;
  return callTool<RfxDraft>({
    model: MODELS.analyst,
    system,
    content,
    tool: { name: "draft_rfx", description: "Return the editable RFx draft.", input_schema: SCHEMA },
    maxTokens: 12000,
  });
}
