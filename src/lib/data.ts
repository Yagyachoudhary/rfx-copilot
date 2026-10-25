import type { SupabaseClient } from "@supabase/supabase-js";
import { buildComparison, type Comparison } from "./compare";
import type {
  ExceptionRow,
  ExtractedLine,
  NormalizedLine,
  QuestionnaireAnswer,
  Rfq,
  RfqLine,
  RfqQuestion,
  RfqSupplier,
  SourceFile,
  Supplier,
  SupplierResponse,
} from "./types";

export type RfqBundle = {
  rfq: Rfq;
  lines: RfqLine[];
  questions: RfqQuestion[];
  invites: (RfqSupplier & { supplier: Supplier })[];
  suppliers: Supplier[];
  responses: SupplierResponse[]; // all versions
  active: SupplierResponse[];
  files: SourceFile[];
  extracted: ExtractedLine[];
  normalized: NormalizedLine[];
  exceptions: (ExceptionRow & { id: string; status: "open" | "resolved" | "accepted_risk"; created_at: string })[];
  answers: QuestionnaireAnswer[];
  comparison: Comparison;
};

export async function loadRfqBundle(db: SupabaseClient, rfqId: string): Promise<RfqBundle | null> {
  const { data: rfq } = await db.from("rfqs").select("*").eq("id", rfqId).maybeSingle();
  if (!rfq) return null;
  const [lines, questions, invites, responses] = await Promise.all([
    db.from("rfq_line_items").select("*").eq("rfq_id", rfqId).order("line_no"),
    db.from("rfq_questions").select("*").eq("rfq_id", rfqId).order("q_no"),
    db.from("rfq_suppliers").select("*, supplier:suppliers(*)").eq("rfq_id", rfqId),
    db.from("supplier_responses").select("*").eq("rfq_id", rfqId).order("received_at"),
  ]);
  const allResp = (responses.data ?? []) as SupplierResponse[];
  const respIds = allResp.map((r) => r.id);
  const active = allResp.filter((r) => r.is_active);
  const activeIds = active.map((r) => r.id);
  const empty = { data: [] as any[] };
  const [files, extracted, normalized, exceptions, answers] = await Promise.all([
    respIds.length ? db.from("source_files").select("*").in("response_id", respIds).order("created_at") : empty,
    activeIds.length ? db.from("extracted_quote_lines").select("*").in("response_id", activeIds).order("seq") : empty,
    activeIds.length ? db.from("normalized_quote_lines").select("*").in("response_id", activeIds) : empty,
    db.from("exceptions").select("*").eq("rfq_id", rfqId).order("created_at"),
    activeIds.length ? db.from("questionnaire_answers").select("*").in("response_id", activeIds) : empty,
  ]);
  const inv = ((invites.data ?? []) as any[]).sort((a, b) => a.supplier.name.localeCompare(b.supplier.name));
  const suppliers = inv.map((i) => i.supplier as Supplier);
  const fileNames: Record<string, string> = {};
  for (const f of (files.data ?? []) as SourceFile[]) fileNames[f.id] = f.file_name;
  const activeSet = new Set(activeIds);
  const exc = ((exceptions.data ?? []) as any[]).filter((e) => !e.response_id || activeSet.has(e.response_id));
  const comparison = buildComparison({
    lines: (lines.data ?? []) as RfqLine[],
    suppliers,
    responses: active,
    normalized: (normalized.data ?? []).map((n: any) => ({ ...n, unit_price_base: n.unit_price_base === null ? null : Number(n.unit_price_base), extended_price_base: n.extended_price_base === null ? null : Number(n.extended_price_base) })),
    extracted: (extracted.data ?? []) as ExtractedLine[],
    exceptions: exc,
    questions: (questions.data ?? []) as RfqQuestion[],
    answers: (answers.data ?? []) as QuestionnaireAnswer[],
    fileNames,
  });
  return {
    rfq: rfq as Rfq,
    lines: (lines.data ?? []) as RfqLine[],
    questions: (questions.data ?? []) as RfqQuestion[],
    invites: inv,
    suppliers,
    responses: allResp,
    active,
    files: (files.data ?? []) as SourceFile[],
    extracted: (extracted.data ?? []) as ExtractedLine[],
    normalized: (normalized.data ?? []) as NormalizedLine[],
    exceptions: exc,
    answers: (answers.data ?? []) as QuestionnaireAnswer[],
    comparison,
  };
}
