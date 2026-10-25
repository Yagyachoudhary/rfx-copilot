import { getContext } from "@/lib/context";
import { RfxEditor } from "@/components/RfxEditor";
import type { EditorState } from "@/lib/rfx-editor-state";

export const dynamic = "force-dynamic";

export default async function RfxOverview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getContext();
  const db = ctx.supabase;
  const [{ data: rfq }, { data: lines }, { data: qs }, { data: inv }, { data: suppliers }, { count }] = await Promise.all([
    db.from("rfqs").select("*").eq("id", id).single(),
    db.from("rfq_line_items").select("*").eq("rfq_id", id).order("line_no"),
    db.from("rfq_questions").select("*").eq("rfq_id", id).order("q_no"),
    db.from("rfq_suppliers").select("supplier_id").eq("rfq_id", id),
    db.from("suppliers").select("id, name, location").order("name"),
    db.from("supplier_responses").select("id", { count: "exact", head: true }).eq("rfq_id", id),
  ]);
  if (!rfq) return null;
  const usd = rfq.currency_policy?.rates?.USD;
  const initial: EditorState = {
    title: rfq.title,
    description: rfq.description ?? "",
    category: rfq.category ?? "",
    currency: rfq.currency,
    response_deadline: rfq.response_deadline ?? "",
    required_by: rfq.required_by ?? "",
    delivery_location: rfq.delivery_location ?? "",
    commercial_terms: rfq.commercial_terms ?? {},
    lines: (lines ?? []).map((l) => ({ line_no: l.line_no, description: l.description, specification: l.specification ?? "", quantity: Number(l.quantity), uom: l.uom, category: l.category ?? "" })),
    questions: (qs ?? []).map((q) => ({ question: q.question, answer_type: q.answer_type, must_pass: q.must_pass, pass_op: q.pass_rule?.op ?? "", pass_value: q.pass_rule?.value ?? "", requires_evidence: q.requires_evidence })),
    criteria: rfq.evaluation_rules?.criteria ?? [],
    supplierIds: (inv ?? []).map((i) => i.supplier_id),
    fxUsd: usd?.rate ?? 84.2,
    fxAsOf: usd?.as_of ?? "",
    ai_draft: false,
    assumptions: [],
    open_questions: [],
  };
  return <RfxEditor rfqId={id} suppliers={suppliers ?? []} initial={initial} linesLocked={rfq.status !== "draft" || (count ?? 0) > 0} />;
}
