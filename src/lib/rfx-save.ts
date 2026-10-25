import type { SupabaseClient } from "@supabase/supabase-js";

export function parsePassValue(answerType: string, v: any) {
  if (v === "" || v === null || v === undefined) return null;
  if (answerType === "yes_no") return v === true || String(v).toLowerCase() === "true" || String(v).toLowerCase() === "yes";
  if (answerType === "number") return Number(v);
  return v;
}

export function headerFromEditor(s: any) {
  return {
    title: String(s.title ?? "").trim(),
    description: s.description ?? null,
    category: s.category ?? null,
    currency: (s.currency || "INR").toUpperCase(),
    response_deadline: s.response_deadline || null,
    required_by: s.required_by || null,
    delivery_location: s.delivery_location || null,
    commercial_terms: { ...s.commercial_terms, validity_days: Number(s.commercial_terms?.validity_days) || null },
    evaluation_rules: {
      criteria: (s.criteria ?? []).map((c: any) => ({ name: c.name, weight: Number(c.weight) || 0 })),
      qualification: "Supplier must meet all must-pass questionnaire items.",
    },
    currency_policy: {
      base: (s.currency || "INR").toUpperCase(),
      policy: "Non-base-currency quotes are converted at a buyer-set fixed rate. Raw currency is always preserved. No live FX feed in this prototype.",
      rates: { USD: { rate: Number(s.fxUsd) || 84.2, as_of: s.fxAsOf || new Date().toISOString().slice(0, 10), source: "Buyer-set fixed rate" } },
    },
  };
}

export async function replaceLinesAndQuestions(db: SupabaseClient, orgId: string, rfqId: string, s: any) {
  await db.from("rfq_line_items").delete().eq("rfq_id", rfqId);
  await db.from("rfq_questions").delete().eq("rfq_id", rfqId);
  const lines = (s.lines ?? [])
    .filter((l: any) => String(l.description ?? "").trim())
    .map((l: any, i: number) => ({
      org_id: orgId,
      rfq_id: rfqId,
      line_no: i + 1,
      description: String(l.description).trim(),
      specification: l.specification || null,
      quantity: Number(l.quantity) || 0,
      uom: l.uom || "pcs",
      category: l.category || null,
      required_by: s.required_by || null,
    }));
  const qs = (s.questions ?? [])
    .filter((q: any) => String(q.question ?? "").trim())
    .map((q: any, i: number) => ({
      org_id: orgId,
      rfq_id: rfqId,
      q_no: i + 1,
      question: q.question,
      answer_type: q.answer_type,
      must_pass: !!q.must_pass,
      pass_rule: q.must_pass && q.pass_op ? { op: q.pass_op, value: parsePassValue(q.answer_type, q.pass_value) } : null,
      requires_evidence: !!q.requires_evidence,
    }));
  if (lines.length) {
    const { error } = await db.from("rfq_line_items").insert(lines);
    if (error) throw new Error(`Saving lines failed: ${error.message}`);
  }
  if (qs.length) {
    const { error } = await db.from("rfq_questions").insert(qs);
    if (error) throw new Error(`Saving questions failed: ${error.message}`);
  }
  return { lines: lines.length, questions: qs.length };
}

export async function syncInvites(db: SupabaseClient, orgId: string, rfqId: string, supplierIds: string[]) {
  const { data: cur } = await db.from("rfq_suppliers").select("id, supplier_id, delivery_status").eq("rfq_id", rfqId);
  const have = new Set((cur ?? []).map((c) => c.supplier_id));
  const add = supplierIds.filter((id) => !have.has(id)).map((id) => ({ org_id: orgId, rfq_id: rfqId, supplier_id: id }));
  if (add.length) await db.from("rfq_suppliers").insert(add);
  const remove = (cur ?? []).filter((c) => !supplierIds.includes(c.supplier_id) && c.delivery_status === "not_sent").map((c) => c.id);
  if (remove.length) await db.from("rfq_suppliers").delete().in("id", remove);
}
