import type { QuestionnaireAnswer, RfqQuestion } from "./types";

/** true/false when the answer can be evaluated, null when it cannot (missing or non-numeric). */
export function meetsRule(q: RfqQuestion, a: QuestionnaireAnswer | undefined): boolean | null {
  if (!a || !a.raw_answer || a.review_status === "missing") return null;
  if (a.review_status === "rejected") return false;
  if (!q.pass_rule) return null;
  const v = a.normalized_value ?? {};
  const { op, value } = q.pass_rule;
  if (q.answer_type === "yes_no") {
    if (v.bool === null || v.bool === undefined) return null;
    return op === "eq" ? v.bool === value : null;
  }
  if (q.answer_type === "number") {
    if (v.number === null || v.number === undefined || Number.isNaN(Number(v.number))) return null;
    const n = Number(v.number);
    if (op === "gte") return n >= Number(value);
    if (op === "lte") return n <= Number(value);
    if (op === "eq") return n === Number(value);
  }
  return null;
}

export type Qualification = {
  status: "qualified_verified" | "qualified_claimed" | "not_qualified" | "incomplete";
  label: string;
  failed: number[];
  missing: number[];
  unverified: number[];
};

export function qualify(questions: RfqQuestion[], answers: QuestionnaireAnswer[]): Qualification {
  const must = questions.filter((q) => q.must_pass);
  const failed: number[] = [];
  const missing: number[] = [];
  const unverified: number[] = [];
  for (const q of must) {
    const a = answers.find((x) => x.question_id === q.id);
    const m = meetsRule(q, a);
    if (m === false) failed.push(q.q_no);
    else if (m === null) missing.push(q.q_no);
    else if (q.requires_evidence && a?.review_status !== "verified") unverified.push(q.q_no);
  }
  if (failed.length) return { status: "not_qualified", label: `Not qualified (fails Q${failed.join(", Q")})`, failed, missing, unverified };
  if (missing.length) return { status: "incomplete", label: `Incomplete (Q${missing.join(", Q")} unanswered)`, failed, missing, unverified };
  if (unverified.length) return { status: "qualified_claimed", label: "Qualified on claims (evidence unverified)", failed, missing, unverified };
  return { status: "qualified_verified", label: "Qualified (verified)", failed, missing, unverified };
}
