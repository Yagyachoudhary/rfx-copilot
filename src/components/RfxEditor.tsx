"use client";
import { readJson } from "@/lib/read-json";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Plus, Save, Sparkles, Trash2, Wand2 } from "lucide-react";
import { AiBadge } from "./ui";

import { type EditorLine, type EditorQuestion, type EditorState } from "@/lib/rfx-editor-state";
export type { EditorLine, EditorQuestion, EditorState };

export function RfxEditor({
  suppliers,
  initial,
  rfqId,
  linesLocked,
  showCopilot,
  initialBrief,
}: {
  suppliers: { id: string; name: string; location: string | null }[];
  initial: EditorState;
  rfqId?: string;
  linesLocked?: boolean;
  showCopilot?: boolean;
  initialBrief?: string;
}) {
  const router = useRouter();
  const [s, setS] = useState<EditorState>(initial);
  const [brief, setBrief] = useState(initialBrief ?? "");
  const autoRan = useRef(false);
  const [pasted, setPasted] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const up = (patch: Partial<EditorState>) => {
    setSaved(false);
    setS((p) => ({ ...p, ...patch }));
  };
  const weightSum = s.criteria.reduce((a, c) => a + (Number(c.weight) || 0), 0);

  useEffect(() => {
    if (initialBrief && !autoRan.current) {
      autoRan.current = true;
      generate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialBrief]);

  async function generate() {
    setDrafting(true);
    setErr(null);
    try {
      const res = await fetch("/api/rfx/draft", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ brief, lines: pasted }) });
      const j = await readJson(res);
      if (!res.ok) throw new Error(j.error ?? "Draft failed");
      const d = j.draft;
      setS((p) => ({
        ...p,
        title: d.title ?? "",
        description: d.description ?? "",
        category: d.category ?? "",
        currency: d.currency ?? "INR",
        response_deadline: d.response_deadline ?? "",
        required_by: d.required_by ?? "",
        delivery_location: d.delivery_location ?? "",
        commercial_terms: d.commercial_terms ?? p.commercial_terms,
        lines: (d.line_items ?? []).map((l: any) => ({ description: l.description, specification: l.specification ?? "", quantity: l.quantity, uom: l.uom, category: l.category ?? "" })),
        questions: (d.questionnaire ?? []).map((q: any) => ({ question: q.question, answer_type: q.answer_type, must_pass: !!q.must_pass, pass_op: q.pass_op ?? "", pass_value: q.pass_value ?? "", requires_evidence: !!q.requires_evidence })),
        criteria: (d.evaluation_criteria ?? p.criteria).map((c: any) => ({ name: c.name, weight: c.weight })),
        supplierIds: (d.suggested_supplier_ids ?? []).filter((id: string) => suppliers.some((x) => x.id === id)),
        ai_draft: true,
        assumptions: d.assumptions ?? [],
        open_questions: d.open_questions ?? [],
      }));
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setDrafting(false);
    }
  }

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(rfqId ? `/api/rfx/${rfqId}` : "/api/rfx", {
        method: rfqId ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(s),
      });
      const j = await readJson(res);
      if (!res.ok) throw new Error(j.error ?? "Save failed");
      setSaved(true);
      if (!rfqId) router.push(`/rfx/${j.id}/send`);
      else router.refresh();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  const setLine = (i: number, patch: Partial<EditorLine>) => up({ lines: s.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  const setQ = (i: number, patch: Partial<EditorQuestion>) => up({ questions: s.questions.map((q, j) => (j === i ? { ...q, ...patch } : q)) });

  return (
    <div className="space-y-5">
      {showCopilot && (
        <section className="card overflow-hidden">
          <div className="brand-gradient text-white px-5 py-4">
            <div className="flex items-center gap-2 font-bold text-[15px]">
              <Sparkles className="w-4 h-4" /> RFx co-pilot
            </div>
            <p className="text-white/85 text-[13px] mt-0.5">Describe what you need in plain language. The co-pilot drafts scope, line items, questionnaire, terms and evaluation criteria — every field stays editable.</p>
          </div>
          <div className="p-4 grid md:grid-cols-2 gap-3">
            <div>
              <label className="label">What do you need?</label>
              <textarea
                className="input min-h-[110px]"
                placeholder="e.g. 6-month rate contract for corrugated boxes for our Hosur DC: 3-ply and 5-ply RSC cartons in our standard sizes, partitions, BOPP tape and stretch film. Need ISO 9001 suppliers within 150 km, delivery from 1 Dec, quotes in 10 days."
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Paste your line list (optional)</label>
              <textarea className="input min-h-[110px] font-mono text-[12px]" placeholder={"3-ply RSC 250x200x150, 40000 pcs\n5-ply RSC 450x300x300 printed, 25000 pcs\n…"} value={pasted} onChange={(e) => setPasted(e.target.value)} />
            </div>
            <div className="md:col-span-2 flex items-center gap-3">
              <button className="btn-primary" onClick={generate} disabled={drafting || brief.trim().length < 10}>
                {drafting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />} {drafting ? "Drafting…" : s.ai_draft ? "Regenerate draft" : "Generate draft"}
              </button>
              <span className="text-[12px] text-ink-muted">Generating replaces the form below. Nothing is sent to suppliers until you review and send.</span>
            </div>
          </div>
        </section>
      )}

      {s.ai_draft && (
        <div className="card p-4 border-l-4" style={{ borderLeftColor: "rgb(var(--c-brand-mid))" }}>
          <div className="flex items-center gap-2 mb-2">
            <AiBadge /> <span className="font-semibold">This is a draft. Review every field — you own what goes to suppliers.</span>
          </div>
          <div className="grid md:grid-cols-2 gap-4 text-[13px]">
            {s.assumptions.length > 0 && (
              <div>
                <div className="font-semibold mb-1">Assumptions the co-pilot made</div>
                <ul className="list-disc pl-5 space-y-0.5 text-ink-muted">{s.assumptions.map((a, i) => <li key={i}>{a}</li>)}</ul>
              </div>
            )}
            {s.open_questions.length > 0 && (
              <div>
                <div className="font-semibold mb-1">Confirm before sending</div>
                <ul className="list-disc pl-5 space-y-0.5 text-ink-muted">{s.open_questions.map((a, i) => <li key={i}>{a}</li>)}</ul>
              </div>
            )}
          </div>
        </div>
      )}

      <section className="card p-4 space-y-3">
        <h2 className="font-semibold">Event details</h2>
        <div className="grid md:grid-cols-3 gap-3">
          <div className="md:col-span-2">
            <label className="label">Title</label>
            <input className="input" value={s.title} onChange={(e) => up({ title: e.target.value })} />
          </div>
          <div>
            <label className="label">Category</label>
            <input className="input" value={s.category} onChange={(e) => up({ category: e.target.value })} />
          </div>
          <div className="md:col-span-3">
            <label className="label">Scope (suppliers read this)</label>
            <textarea className="input min-h-[70px]" value={s.description} onChange={(e) => up({ description: e.target.value })} />
          </div>
          <div>
            <label className="label">Response deadline</label>
            <input type="date" className="input" value={s.response_deadline ?? ""} onChange={(e) => up({ response_deadline: e.target.value })} />
          </div>
          <div>
            <label className="label">Required by</label>
            <input type="date" className="input" value={s.required_by ?? ""} onChange={(e) => up({ required_by: e.target.value })} />
          </div>
          <div>
            <label className="label">Delivery location</label>
            <input className="input" value={s.delivery_location ?? ""} onChange={(e) => up({ delivery_location: e.target.value })} />
          </div>
        </div>
      </section>

      <section className="card p-4 space-y-3">
        <h2 className="font-semibold">Commercial terms &amp; currency policy</h2>
        <div className="grid md:grid-cols-3 gap-3">
          {(["price_basis", "tax", "payment_terms", "freight"] as const).map((k) => (
            <div key={k}>
              <label className="label capitalize">{k.replace("_", " ")}</label>
              <input className="input" value={(s.commercial_terms as any)[k] ?? ""} onChange={(e) => up({ commercial_terms: { ...s.commercial_terms, [k]: e.target.value } })} />
            </div>
          ))}
          <div>
            <label className="label">Quote validity (days)</label>
            <input className="input" type="number" value={s.commercial_terms.validity_days ?? ""} onChange={(e) => up({ commercial_terms: { ...s.commercial_terms, validity_days: e.target.value } })} />
          </div>
          <div>
            <label className="label">Base currency</label>
            <input className="input" value={s.currency} onChange={(e) => up({ currency: e.target.value.toUpperCase() })} disabled={linesLocked} />
          </div>
          <div>
            <label className="label">USD → {s.currency} rate (buyer-set)</label>
            <input className="input num" type="number" step="0.01" value={s.fxUsd} onChange={(e) => up({ fxUsd: e.target.value })} />
          </div>
          <div>
            <label className="label">Rate as of</label>
            <input className="input" type="date" value={s.fxAsOf} onChange={(e) => up({ fxAsOf: e.target.value })} />
          </div>
          <div className="md:col-span-1 text-[12px] text-ink-muted self-end">Changing the rate re-normalizes every USD quote and is logged in the activity trail.</div>
        </div>
      </section>

      <section className="card">
        <header className="flex items-center justify-between px-4 py-3 border-b border-line">
          <h2 className="font-semibold">
            Line items <span className="text-ink-muted font-normal">({s.lines.length})</span>
          </h2>
          {linesLocked ? (
            <span className="chip chip-muted">Locked — responses reference these lines</span>
          ) : (
            <button className="btn-secondary btn-sm" onClick={() => up({ lines: [...s.lines, { description: "", specification: "", quantity: "", uom: "pcs", category: "" }] })}>
              <Plus className="w-3.5 h-3.5" /> Add line
            </button>
          )}
        </header>
        <div className="overflow-x-auto max-h-[480px]">
          <table className="tbl">
            <thead>
              <tr>
                <th className="w-10">#</th>
                <th className="min-w-[240px]">Description</th>
                <th className="min-w-[240px]">Specification</th>
                <th className="w-28">Qty</th>
                <th className="w-24">UOM</th>
                <th className="min-w-[120px]">Category</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {s.lines.map((l, i) => (
                <tr key={i}>
                  <td className="num text-ink-muted pt-3">{i + 1}</td>
                  <td><input className="input" value={l.description} disabled={linesLocked} onChange={(e) => setLine(i, { description: e.target.value })} /></td>
                  <td><input className="input" value={l.specification} disabled={linesLocked} onChange={(e) => setLine(i, { specification: e.target.value })} /></td>
                  <td><input className="input num" type="number" value={l.quantity} disabled={linesLocked} onChange={(e) => setLine(i, { quantity: e.target.value })} /></td>
                  <td><input className="input" value={l.uom} disabled={linesLocked} onChange={(e) => setLine(i, { uom: e.target.value })} /></td>
                  <td><input className="input" value={l.category} disabled={linesLocked} onChange={(e) => setLine(i, { category: e.target.value })} /></td>
                  <td>
                    {!linesLocked && (
                      <button className="btn-ghost btn-sm" aria-label="Remove line" onClick={() => up({ lines: s.lines.filter((_, j) => j !== i) })}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <header className="flex items-center justify-between px-4 py-3 border-b border-line">
          <h2 className="font-semibold">Supplier questionnaire</h2>
          {!linesLocked && (
            <button className="btn-secondary btn-sm" onClick={() => up({ questions: [...s.questions, { question: "", answer_type: "yes_no", must_pass: false, pass_op: "", pass_value: "", requires_evidence: false }] })}>
              <Plus className="w-3.5 h-3.5" /> Add question
            </button>
          )}
        </header>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th className="w-10">Q</th>
                <th className="min-w-[320px]">Question</th>
                <th>Answer type</th>
                <th>Must-pass</th>
                <th>Rule</th>
                <th>Evidence</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {s.questions.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-ink-muted text-center py-6">No questions yet.</td>
                </tr>
              )}
              {s.questions.map((q, i) => (
                <tr key={i}>
                  <td className="num text-ink-muted pt-3">{i + 1}</td>
                  <td><input className="input" value={q.question} disabled={linesLocked} onChange={(e) => setQ(i, { question: e.target.value })} /></td>
                  <td>
                    <select className="input" value={q.answer_type} disabled={linesLocked} onChange={(e) => setQ(i, { answer_type: e.target.value as any })}>
                      <option value="yes_no">Yes / No</option>
                      <option value="number">Number</option>
                      <option value="text">Text</option>
                    </select>
                  </td>
                  <td className="pt-3 text-center"><input type="checkbox" checked={q.must_pass} disabled={linesLocked} onChange={(e) => setQ(i, { must_pass: e.target.checked })} /></td>
                  <td className="min-w-[160px]">
                    {q.must_pass && (
                      <div className="flex gap-1">
                        <select className="input w-20" value={q.pass_op ?? ""} disabled={linesLocked} onChange={(e) => setQ(i, { pass_op: e.target.value as any })}>
                          <option value="">—</option>
                          <option value="eq">=</option>
                          <option value="gte">≥</option>
                          <option value="lte">≤</option>
                        </select>
                        <input className="input" value={String(q.pass_value ?? "")} disabled={linesLocked} onChange={(e) => setQ(i, { pass_value: e.target.value })} placeholder={q.answer_type === "yes_no" ? "true" : "value"} />
                      </div>
                    )}
                  </td>
                  <td className="pt-3 text-center"><input type="checkbox" checked={q.requires_evidence} disabled={linesLocked} onChange={(e) => setQ(i, { requires_evidence: e.target.checked })} /></td>
                  <td>
                    {!linesLocked && (
                      <button className="btn-ghost btn-sm" aria-label="Remove question" onClick={() => up({ questions: s.questions.filter((_, j) => j !== i) })}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card p-4 grid md:grid-cols-2 gap-5">
        <div>
          <h2 className="font-semibold mb-2">Evaluation criteria</h2>
          <div className="space-y-2">
            {s.criteria.map((c, i) => (
              <div key={i} className="flex gap-2">
                <input className="input" value={c.name} onChange={(e) => up({ criteria: s.criteria.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                <input className="input w-20 num" type="number" value={c.weight} onChange={(e) => up({ criteria: s.criteria.map((x, j) => (j === i ? { ...x, weight: e.target.value } : x)) })} />
              </div>
            ))}
          </div>
          <div className={`text-[12px] mt-2 ${weightSum === 100 ? "text-ink-muted" : "text-warn-strong"}`}>Weights sum to {weightSum}{weightSum !== 100 && " — should be 100"}</div>
        </div>
        <div>
          <h2 className="font-semibold mb-2">Invited suppliers</h2>
          {suppliers.length === 0 ? (
            <p className="text-ink-muted text-[13px]">No suppliers yet — add them on the Suppliers page.</p>
          ) : (
            <div className="space-y-1.5 max-h-56 overflow-auto">
              {suppliers.map((sp) => (
                <label key={sp.id} className="flex items-center gap-2 text-[13px]">
                  <input
                    type="checkbox"
                    checked={s.supplierIds.includes(sp.id)}
                    onChange={(e) => up({ supplierIds: e.target.checked ? [...s.supplierIds, sp.id] : s.supplierIds.filter((x) => x !== sp.id) })}
                  />
                  <span className="font-medium">{sp.name}</span>
                  <span className="text-ink-muted">{sp.location}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </section>

      <div className="sticky bottom-0 bg-canvas/95 backdrop-blur py-3 flex items-center gap-3 border-t border-line">
        <button className="btn-primary h-9" onClick={save} disabled={saving || !s.title || s.lines.length === 0}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} {rfqId ? "Save changes" : "Save draft & review sending"}
        </button>
        {saved && <span className="chip chip-ok">Saved</span>}
        {err && (
          <span className="chip chip-bad !whitespace-normal">
            <AlertTriangle className="w-3 h-3" /> {err}
          </span>
        )}
      </div>
    </div>
  );
}
