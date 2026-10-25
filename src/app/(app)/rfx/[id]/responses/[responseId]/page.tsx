import { notFound } from "next/navigation";
import { getContext } from "@/lib/context";
import { meetsRule } from "@/lib/qualification";
import { ReviewWorkspace } from "./ReviewWorkspace";

export const dynamic = "force-dynamic";

export default async function ReviewPage({ params }: { params: Promise<{ id: string; responseId: string }> }) {
  const { id, responseId } = await params;
  const ctx = await getContext();
  const db = ctx.supabase;
  const { data: resp } = await db.from("supplier_responses").select("*, supplier:suppliers(*)").eq("id", responseId).maybeSingle();
  if (!resp) notFound();
  const [{ data: rfq }, { data: lines }, { data: files }, { data: extracted }, { data: normalized }, { data: overrides }, { data: questions }, { data: answers }, { data: exceptions }, { data: runs }] = await Promise.all([
    db.from("rfqs").select("*").eq("id", id).single(),
    db.from("rfq_line_items").select("*").eq("rfq_id", id).order("line_no"),
    db.from("source_files").select("*").eq("response_id", responseId),
    db.from("extracted_quote_lines").select("*").eq("response_id", responseId).order("seq"),
    db.from("normalized_quote_lines").select("*").eq("response_id", responseId),
    db.from("buyer_overrides").select("*").eq("response_id", responseId).order("created_at"),
    db.from("rfq_questions").select("*").eq("rfq_id", id).order("q_no"),
    db.from("questionnaire_answers").select("*").eq("response_id", responseId),
    db.from("exceptions").select("*").eq("response_id", responseId).order("severity"),
    db.from("extraction_runs").select("id, model, status, started_at, finished_at, input_tokens, output_tokens, error, extraction_version").eq("response_id", responseId).order("started_at", { ascending: false }),
  ]);
  const qa = (questions ?? []).map((q) => {
    const a = (answers ?? []).find((x) => x.question_id === q.id);
    return { q, a: a ?? null, meets: meetsRule(q, a as any) };
  });
  const sevOrder = { critical: 0, warning: 1, info: 2 } as Record<string, number>;
  return (
    <ReviewWorkspace
      rfqId={id}
      rfq={rfq}
      response={resp}
      lines={lines ?? []}
      files={files ?? []}
      extracted={extracted ?? []}
      normalized={normalized ?? []}
      overrides={overrides ?? []}
      qa={qa}
      exceptions={(exceptions ?? []).sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity] || (a.status === "open" ? -1 : 1))}
      runs={runs ?? []}
    />
  );
}
