import type Anthropic from "@anthropic-ai/sdk";
import { callTool, deadlineIn, MODELS } from "./client";
import type { PreparedPart } from "../parsers";
import type { RfqLine, RfqQuestion } from "../types";

export const EXTRACTION_VERSION = "v1.0";

const SOURCE = {
  type: "object",
  description: "Where the value is in the source. Fill every coordinate you can see.",
  properties: {
    file_index: { type: "integer", description: "FILE number from the labels (1-based)" },
    page: { type: ["integer", "null"] },
    sheet: { type: ["string", "null"] },
    cell: { type: ["string", "null"], description: "Excel cell address of the price, e.g. F12" },
    row: { type: ["integer", "null"] },
    paragraph: { type: ["integer", "null"], description: "¶ number for Word documents, or [line n] for emails" },
    region: { type: ["string", "null"], description: "For images/footnotes: e.g. 'row 14 of rate table', 'footnote **'" },
  },
  required: ["file_index"],
};

const LINE = {
  type: "object",
  properties: {
    raw_text: { type: "string", description: "The supplier's own wording for this line, verbatim (short)." },
    raw_description: { type: ["string", "null"] },
    raw_item_code: { type: ["string", "null"] },
    rfq_line_no: { type: ["integer", "null"], description: "Best matching buyer RFQ line number, or null if none fits." },
    mapping_confidence: { type: "string", enum: ["high", "medium", "low", "none"] },
    candidate_line_nos: { type: "array", items: { type: "integer" }, description: "Other plausible RFQ lines when mapping is not certain." },
    mapping_rationale: { type: ["string", "null"] },
    quantity: { type: ["number", "null"] },
    uom: { type: ["string", "null"], description: "Unit word the price refers to, as written: pc, Nos, set, roll, kg, box…" },
    unit_price: { type: ["number", "null"], description: "Number exactly as quoted (no conversion). null if absent or unreadable." },
    currency: { type: ["string", "null"], description: "ISO code as evidenced (INR for ₹/Rs/Rupees, USD for $/US Dollars)." },
    price_basis: {
      type: "string",
      enum: ["per_unit", "per_n_units", "per_pack", "per_kg", "lump_sum", "unknown"],
      description:
        "per_unit: price per single uom. per_n_units: price per explicit N units ('per 100 Nos', 'per thousand'). per_pack: per box/bundle/carton of items (N only if the pack size is stated). per_kg: price by weight.",
    },
    basis_quantity: { type: ["number", "null"], description: "N for per_n_units, or pack size for per_pack — ONLY if stated in the source." },
    pack_size_evidence: { type: ["string", "null"], description: "Verbatim text proving the pack size (e.g. 'each carton box contains 36 rolls'). null if not stated." },
    extended_price: { type: ["number", "null"] },
    tax_note: { type: ["string", "null"] },
    lead_time_text: { type: ["string", "null"] },
    notes: { type: ["string", "null"], description: "Anything a buyer should know: footnote markers, revisions, assumptions." },
    confidence: { type: "string", enum: ["high", "medium", "low"], description: "Your confidence that price, unit and mapping are read correctly." },
    legibility: { type: "string", enum: ["clear", "partial", "unreadable"] },
    source: SOURCE,
    source_snippet: { type: ["string", "null"], description: "Short verbatim quote of the source text containing the price." },
  },
  required: ["raw_text", "rfq_line_no", "mapping_confidence", "unit_price", "price_basis", "confidence", "legibility", "source"],
};

const SCHEMA = {
  type: "object",
  properties: {
    document_overview: { type: "string", description: "1-2 sentences: what was received, format quirks." },
    quote_reference: { type: ["string", "null"] },
    quote_date: { type: ["string", "null"] },
    supersedes_note: { type: ["string", "null"], description: "If this says it revises/supersedes an earlier quote, quote that statement." },
    currency_code: { type: ["string", "null"], description: "ISO code of the quote currency as evidenced (INR for ₹/Rs/Rupees)." },
    currency_evidence: { type: ["string", "null"] },
    tax_treatment: { type: "string", enum: ["exclusive", "inclusive", "not_stated"], description: "'GST extra' → exclusive; 'inclusive of GST' → inclusive." },
    tax_rate_percent: { type: ["number", "null"] },
    tax_text: { type: ["string", "null"], description: "Verbatim tax wording." },
    freight_type: { type: "string", enum: ["included", "extra_percent", "extra_amount", "extra_unquantified", "not_stated"] },
    freight_percent: { type: ["number", "null"] },
    freight_amount: { type: ["number", "null"] },
    freight_text: { type: ["string", "null"], description: "Verbatim freight wording." },
    freight_where: { type: ["string", "null"], description: "Where the freight wording is, e.g. 'p.1 footnote *'." },
    payment_terms_text: { type: ["string", "null"] },
    payment_days: { type: ["integer", "null"] },
    validity_days: { type: ["integer", "null"] },
    lead_time_days: { type: ["integer", "null"] },
    lead_time_text: { type: ["string", "null"] },
    discounts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          description: { type: "string" },
          percent: { type: ["number", "null"] },
          conditional: { type: "boolean" },
          condition: { type: ["string", "null"] },
          source: SOURCE,
        },
        required: ["description", "conditional"],
      },
    },
    unresolved_references: {
      type: "array",
      description: "Statements that point to prices NOT contained in the documents (e.g. 'rest same as last year', 'as per our price list').",
      items: { type: "object", properties: { text: { type: "string" }, source: SOURCE }, required: ["text"] },
    },
    other_notes: { type: "array", items: { type: "string" } },
    lines: { type: "array", items: LINE },
    questionnaire: {
      type: "array",
      items: {
        type: "object",
        properties: {
          q_no: { type: "integer" },
          raw_answer: { type: "string", description: "Verbatim supplier answer." },
          value_bool: { type: ["boolean", "null"] },
          value_number: { type: ["number", "null"] },
          value_unit: { type: ["string", "null"] },
          value_text: { type: ["string", "null"] },
          evidence_type: { type: "string", enum: ["claim", "document_attached", "none"], description: "document_attached only if a supporting document is actually among the FILES." },
          evidence_snippet: { type: ["string", "null"] },
          source: SOURCE,
          confidence: { type: "string", enum: ["high", "medium", "low"] },
        },
        required: ["q_no", "raw_answer", "evidence_type", "confidence"],
      },
    },
    extraction_warnings: { type: "array", items: { type: "string" }, description: "Anything you could not read or were unsure about." },
  },
  required: ["document_overview", "currency_code", "tax_treatment", "freight_type", "lines", "questionnaire", "discounts", "unresolved_references", "extraction_warnings"],
};

export type ExtractionOutput = {
  document_overview: string;
  quote_reference?: string | null;
  quote_date?: string | null;
  supersedes_note?: string | null;
  currency_code?: string | null;
  currency_evidence?: string | null;
  tax_treatment?: "exclusive" | "inclusive" | "not_stated";
  tax_rate_percent?: number | null;
  tax_text?: string | null;
  freight_type?: any;
  freight_percent?: number | null;
  freight_amount?: number | null;
  freight_text?: string | null;
  freight_where?: string | null;
  payment_terms_text?: string | null;
  payment_days?: number | null;
  validity_days?: number | null;
  lead_time_days?: number | null;
  lead_time_text?: string | null;
  // legacy nested shapes (older runs)
  currency?: any;
  tax?: any;
  freight?: any;
  payment_terms?: any;
  lead_time?: any;
  discounts: { description: string; percent?: number | null; conditional: boolean; condition?: string | null; source?: any }[];
  unresolved_references: { text: string; source?: any }[];
  other_notes?: string[];
  lines: any[];
  questionnaire: any[];
  extraction_warnings: string[];
};

const SYSTEM = `You are the quote-extraction engine inside a procurement platform. A buyer will make a high-value award decision based on what you return, so accuracy and honesty about uncertainty matter more than completeness.

Rules:
- Extract only what is in the supplied files. Never invent, estimate, or "fill in" a price. If a value is missing, blurred, cut off or ambiguous, return null and say why (legibility 'unreadable' or 'partial', confidence 'low', warning).
- Report prices exactly as quoted: original number, original currency, original unit basis. Do NOT convert currencies, units, pack sizes or taxes — a separate deterministic step does that.
- price_basis: 'per 100 Nos' → per_n_units with basis_quantity 100; 'USD x per thousand pieces' → per_n_units 1000; 'per box' / 'per bundle of 50 sets' → per_pack, with basis_quantity ONLY if the pack size is stated in the files (quote it in pack_size_evidence); price per kg → per_kg.
- Map each supplier line to the buyer's RFQ line by size, ply/grade, print and type. Use mapping_confidence 'high' only when size AND construction match. If a supplier line could be two RFQ lines (e.g. same size but ply not stated), set mapping_confidence 'low', put your best guess in rfq_line_no and list ALL plausible lines in candidate_line_nos. Never map two different supplier lines to one RFQ line unless the supplier really priced it twice (then list both — that is a conflict the buyer must see).
- If one price statement explicitly applies to a group of RFQ lines (e.g. 'Rs 42/kg for the 5-ply'), emit one entry per RFQ line it covers, each with the same snippet, mapping_confidence 'medium' and a note 'group price'.
- If an item is explicitly not quoted ('unable to quote', 'not quoting'), do NOT create a line for it; add a note in other_notes.
- Prices can hide in footnotes, email bodies, paragraphs and second sheets. Read everything, including small print. Footnote discounts/freight belong in discounts/freight, not in line prices.
- References to prices that are not in the files ('rest same as last year', 'as per previous PO') go to unresolved_references; never assume those prices.
- Header terms are flat fields: currency_code, tax_treatment (+ tax_rate_percent), freight_type (+ freight_percent/amount), payment_days, validity_days, lead_time_days. Read headers, notes and footnotes for them.
- Tax: 'GST extra' → exclusive; 'inclusive of GST 18%' → inclusive with rate 18; silence → not_stated.
- Freight: included ('delivered', 'door delivery') / extra_percent (with percent) / extra_amount / extra_unquantified ('freight extra' with no amount) / not_stated.
- Questionnaire: answer only questions the supplier actually addressed, by q_no. evidence_type 'document_attached' only when a supporting file (e.g. a certificate) is actually present in FILES; 'certificate available on request' or 'to follow' is a 'claim'.
- Source references: always give file_index plus the most precise coordinate available (sheet+cell for Excel, page for PDF, ¶ number for Word, line number for email, a short region description for photos), and a short verbatim source_snippet.
- For photos: read row by row along the printed lines; if a value is blurred or shadowed, do not guess digits.`;

export function buildExtractionContent(params: {
  rfq: { ref_code: string; title: string; currency: string };
  lines: RfqLine[];
  questions: RfqQuestion[];
  parts: PreparedPart[];
  emailMeta?: { subject?: string | null; body?: string | null; channel?: string | null };
}): Anthropic.MessageParam["content"] {
  const lineTable = params.lines
    .map((l) => `L${l.line_no} | ${l.description} | ${l.specification ?? ""} | qty ${l.quantity} ${l.uom}`)
    .join("\n");
  const qTable = params.questions.map((q) => `Q${q.q_no} (${q.answer_type}${q.must_pass ? ", must-pass" : ""}): ${q.question}`).join("\n");
  const content: any[] = [
    {
      type: "text",
      text: `RFQ ${params.rfq.ref_code} — ${params.rfq.title}. Buyer currency: ${params.rfq.currency}.\n\nBUYER RFQ LINES (line | description | spec | requested qty & unit):\n${lineTable}\n\nQUESTIONNAIRE:\n${qTable}\n\n${
        params.emailMeta?.subject || params.emailMeta?.body
          ? `RECEIVED VIA ${params.emailMeta.channel ?? "email"} — subject: ${params.emailMeta.subject ?? "(none)"}\nMessage text: ${params.emailMeta.body ?? "(none)"}\n\n`
          : ""
      }The supplier's response files follow. Extract everything into the record_quote_extraction tool.`,
    },
  ];
  params.parts.forEach((p, i) => {
    const header = `FILE ${i + 1}: ${p.label}`;
    if (p.kind === "text") content.push({ type: "text", text: `${header}\n${p.text}` });
    else if (p.kind === "pdf") {
      content.push({ type: "text", text: header });
      content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: p.base64 } });
    } else {
      content.push({ type: "text", text: `${header} (photo/scan)` });
      content.push({ type: "image", source: { type: "base64", media_type: p.mediaType, data: p.base64 } });
    }
  });
  return content;
}

export async function runExtraction(content: Anthropic.MessageParam["content"]) {
  return callTool<ExtractionOutput>({
    model: MODELS.extraction,
    system: SYSTEM,
    content,
    tool: {
      name: "record_quote_extraction",
      description: "Record everything extracted from the supplier response, with raw values, mapping, confidence and source references.",
      input_schema: SCHEMA,
    },
    maxTokens: 20000,
    deadline: deadlineIn(270), // processing routes allow 300 s
  });
}
