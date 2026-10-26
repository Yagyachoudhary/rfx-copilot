"use client";
import { readJson } from "@/lib/read-json";
import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import {
  ArrowRight,
  Box,
  CalendarClock,
  Check,
  ChevronRight,
  FileSpreadsheet,
  FileText,
  FileType2,
  Hash,
  IndianRupee,
  Loader2,
  MoreHorizontal,
  Paperclip,
  Send,
  ShieldCheck,
  Sparkles,
  Truck,
  Upload,
  X,
} from "lucide-react";
import { RfxEditor } from "@/components/RfxEditor";
import { blankState, type EditorState } from "@/lib/rfx-editor-state";

type Q = { id: string; kind: string; title: string; detail: string; options: string[]; answer?: string };

const KIND: Record<string, { icon: any; tint: string; color: string }> = {
  specs: { icon: Box, tint: "rgb(var(--c-danger) / .07)", color: "rgb(var(--c-danger))" },
  quantity: { icon: Hash, tint: "rgb(var(--c-accent) / .07)", color: "rgb(var(--c-accent))" },
  delivery: { icon: Truck, tint: "rgb(var(--c-warning) / .09)", color: "rgb(var(--c-warning))" },
  quality: { icon: ShieldCheck, tint: "rgb(var(--c-warning) / .09)", color: "rgb(var(--c-warning))" },
  commercial: { icon: IndianRupee, tint: "rgb(var(--c-success) / .08)", color: "rgb(var(--c-success))" },
  timeline: { icon: CalendarClock, tint: "rgb(var(--c-brand-mid) / .07)", color: "rgb(var(--c-brand-mid))" },
};

const EXAMPLES = [
  { label: "Packaging for FMCG products", text: "6-month rate contract for corrugated boxes for our Hosur DC — 3-ply and 5-ply RSC cartons in our standard sizes, partitions, BOPP tape and stretch film", category: "Packaging & consumables", locations: "Hosur DC" },
  { label: "IT laptops for corporate use", text: "120 business laptops for new hires: 16 GB RAM, 512 GB SSD, 14-inch, 3-year onsite warranty, delivered to Bengaluru and Pune offices", category: "IT hardware", locations: "Bengaluru, Pune" },
  { label: "Facility management services", text: "Annual facility management for 2 office buildings (1.2 lakh sq ft): housekeeping, pantry, security, minor repairs; SLA-based pricing", category: "Services", locations: "Gurugram" },
];
const CATEGORIES = ["Packaging & consumables", "MRO & spares", "IT hardware", "Raw materials", "Logistics & freight", "Services", "Other"];

function fileIcon(n: string) {
  const s = n.toLowerCase();
  if (/\.(xlsx|csv)$/.test(s)) return <FileSpreadsheet className="w-5 h-5 text-ok-strong" />;
  if (/\.pdf$/.test(s)) return <FileType2 className="w-5 h-5 text-bad-strong" />;
  return <FileText className="w-5 h-5 text-accent" />;
}

function Ring({ score }: { score: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const color = score >= 80 ? "rgb(var(--c-success))" : score >= 50 ? "rgb(var(--c-warning))" : "rgb(var(--c-danger))";
  return (
    <svg viewBox="0 0 84 84" className="w-24 h-24 -rotate-90">
      <circle cx="42" cy="42" r={r} fill="none" stroke="rgb(var(--c-border))" strokeWidth="7" />
      <circle cx="42" cy="42" r={r} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} style={{ transition: "stroke-dashoffset .5s" }} />
    </svg>
  );
}

const Num = ({ n }: { n: number }) => <span className="w-6 h-6 rounded-full bg-primary text-primary-fg grid place-items-center text-[12px] font-bold shrink-0">{n}</span>;

export function CreateRfx({ suppliers, initialBrief }: { suppliers: { id: string; name: string; location: string | null }[]; initialBrief?: string }) {
  const [brief, setBrief] = useState(initialBrief ?? "");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [spend, setSpend] = useState("");
  const [deadline, setDeadline] = useState("");
  const [locations, setLocations] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [qs, setQs] = useState<Q[]>([]);
  const [summary, setSummary] = useState("");
  const [notes, setNotes] = useState<string[]>([]);
  const [analysing, setAnalysing] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditorState | null>(null);
  const [chat, setChat] = useState("");
  const lastAnalysed = useRef("");
  const fileInput = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  const context = { title, category, expected_annual_spend_inr: spend, response_deadline: deadline, delivery_locations: locations };
  const answers = [...qs.filter((q) => q.answer).map((q) => ({ question: q.title, answer: q.answer! })), ...notes.map((n) => ({ question: "Additional note from buyer", answer: n }))];

  async function analyse(force = false) {
    const key = JSON.stringify([brief.trim(), category, locations, files.map((f) => f.name)]);
    if (!force && (brief.trim().length < 12 || key === lastAnalysed.current)) return;
    lastAnalysed.current = key;
    setAnalysing(true);
    try {
      const res = await fetch("/api/rfx/clarify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ brief, context, answers, hasDocs: files.length > 0 }) });
      const j = await readJson(res);
      if (res.ok) {
        setSummary(j.summary);
        setQs((prev) => [...prev.filter((p) => p.answer), ...(j.questions ?? []).filter((n: Q) => !prev.some((p) => p.answer && p.title === n.title))]);
      }
    } finally {
      setAnalysing(false);
    }
  }
  useEffect(() => {
    const t = setTimeout(() => analyse(), 1400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brief, category, locations, files.length]);

  async function generate() {
    setDrafting(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.set("brief", brief);
      fd.set("context", JSON.stringify(context));
      fd.set("answers", JSON.stringify(answers));
      files.forEach((f) => fd.append("files", f));
      const res = await fetch("/api/rfx/draft", { method: "POST", body: fd });
      const j = await readJson(res);
      if (!res.ok) throw new Error(j.error ?? "Draft failed");
      const d = j.draft;
      const base = blankState();
      setDraft({
        ...base,
        title: title || d.title || "",
        description: d.description ?? "",
        category: category || d.category || "",
        currency: d.currency ?? "INR",
        response_deadline: deadline || d.response_deadline || "",
        required_by: d.required_by ?? "",
        delivery_location: locations || d.delivery_location || "",
        commercial_terms: d.commercial_terms ?? base.commercial_terms,
        lines: (d.line_items ?? []).map((l: any) => ({ description: l.description, specification: l.specification ?? "", quantity: l.quantity, uom: l.uom, category: l.category ?? "" })),
        questions: (d.questionnaire ?? []).map((q: any) => ({ question: q.question, answer_type: q.answer_type, must_pass: !!q.must_pass, pass_op: q.pass_op ?? "", pass_value: q.pass_value ?? "", requires_evidence: !!q.requires_evidence })),
        criteria: (d.evaluation_criteria ?? base.criteria).map((c: any) => ({ name: c.name, weight: c.weight })),
        supplierIds: (d.suggested_supplier_ids ?? []).filter((id: string) => suppliers.some((x) => x.id === id)),
        ai_draft: true,
        assumptions: d.assumptions ?? [],
        open_questions: d.open_questions ?? [],
      });
      setTimeout(() => editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setDrafting(false);
    }
  }

  // Readiness: required facts, the context that makes quotes comparable, and open clarifications.
  const checks = useMemo(() => {
    const req = [
      { label: "What you need", ok: brief.trim().length >= 12 || files.length > 0 },
      { label: "Response deadline", ok: !!deadline },
      { label: "Delivery locations", ok: !!locations.trim() },
    ];
    const opt = [
      { label: "Event title", ok: !!title.trim() },
      { label: "Category", ok: !!category },
      { label: "Expected spend", ok: !!spend.trim() },
      { label: "Specs or line list", ok: files.length > 0 },
    ];
    const missing = req.filter((r) => !r.ok).length;
    const clarify = qs.filter((q) => !q.answer).length;
    const complete = [...req, ...opt].filter((r) => r.ok).length + qs.filter((q) => q.answer).length;
    const total = req.length + opt.length + qs.length;
    return { missing, clarify, complete, score: Math.round((complete / Math.max(total, 1)) * 100), req };
  }, [brief, deadline, locations, title, category, spend, files, qs]);

  return (
    <div className="max-w-[1320px]">
      <div className="relative -mx-4 md:-mx-7 -mt-6 px-4 md:px-7 pt-6 pb-8 overflow-hidden">
        <div aria-hidden className="absolute -top-24 right-[22%] w-[380px] h-[260px] rounded-[48%] opacity-80" style={{ background: "rgb(var(--c-accent) / .55)" }} />
        <div aria-hidden className="absolute -top-36 right-[-60px] w-[520px] h-[380px] rounded-[45%] opacity-90" style={{ background: "linear-gradient(135deg, rgb(var(--c-brand-start)) 0%, rgb(var(--c-brand-end)) 100%)" }} />
        <div aria-hidden className="absolute top-6 right-[-120px] w-[260px] h-[260px] rounded-full opacity-70" style={{ background: "rgb(var(--c-success) / .45)" }} />
        <div className="relative flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-xl">
            <div className="text-[13px] text-ink-muted">Events <ChevronRight className="w-3 h-3 inline" /> Create RFx</div>
            <h1 className="text-[32px] font-extrabold tracking-tight mt-2">Create a new sourcing event</h1>
            <p className="text-ink-muted text-[15.5px] mt-2 leading-relaxed">Describe what you need in plain language. Copilot checks what&apos;s missing, then drafts a complete RFx — line items, questionnaire, terms and evaluation criteria.</p>
          </div>
          <div className="card shadow-xl px-5 py-4 flex items-center gap-4 min-w-[320px]">
            <div className="relative">
              <Ring score={checks.score} />
              <div className="absolute inset-0 grid place-items-center text-center leading-none">
                <div><div className="text-[24px] font-extrabold num">{checks.score}</div><div className="text-[11px] text-ink-muted">/ 100</div></div>
              </div>
            </div>
            <div>
              <div className="font-bold text-primary mb-2">RFx readiness</div>
              <ul className="space-y-1.5 text-[13px]">
                <li className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-bad" />{checks.missing} required field{checks.missing === 1 ? "" : "s"} missing</li>
                <li className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-warn" />{checks.clarify} need{checks.clarify === 1 ? "s" : ""} clarification</li>
                <li className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-ok" />{checks.complete} complete</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div className="grid xl:grid-cols-[1fr_430px] gap-5 items-start -mt-2">
        <section className="card p-6 space-y-7 shadow-sm">
          <div>
            <h2 className="flex items-center gap-2.5 font-bold text-[15px]"><Num n={1} /> Tell us what you need</h2>
            <div className="mt-3 relative">
              <textarea
                className="input min-h-[120px] !text-[14px] leading-relaxed pr-10"
                maxLength={2000}
                placeholder="e.g. A yearly rate contract for corrugated boxes — 3-ply and 5-ply cartons for our Hosur warehouse"
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
              />
              <div className="absolute right-3 bottom-2.5 flex items-center gap-2 text-[11.5px] text-ink-muted">
                <span className="num">{brief.length}/2000</span>
                <button type="button" onClick={() => fileInput.current?.click()} aria-label="Attach files"><Paperclip className="w-4 h-4" /></button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-3 text-[13px]">
              <span className="text-ink-muted">Try an example:</span>
              {EXAMPLES.map((x) => (
                <button key={x.label} className="chip chip-muted !py-1 !px-2.5 hover:border-accent" onClick={() => { setBrief(x.text); setCategory(x.category); setLocations(x.locations); }}>{x.label}</button>
              ))}
            </div>
          </div>

          <div>
            <h2 className="flex items-center gap-2.5 font-bold text-[15px]"><Num n={2} /> Add context <span className="font-normal text-ink-muted">(optional)</span></h2>
            <div className="grid md:grid-cols-2 gap-4 mt-3">
              <div>
                <label className="label" htmlFor="t">Event title</label>
                <input id="t" className="input h-10" placeholder="e.g. Corrugated packaging 2026" value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor="c">Category</label>
                <select id="c" className="input h-10" value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="">Select a category</option>
                  {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="grid md:grid-cols-3 gap-4 mt-4">
              <div>
                <label className="label" htmlFor="s">Expected annual spend (₹)</label>
                <input id="s" className="input h-10 num" placeholder="e.g. 50,00,000" value={spend} onChange={(e) => setSpend(e.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor="d">Response deadline <span className="text-bad-strong">*</span></label>
                <input id="d" type="date" className="input h-10" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor="l">Delivery locations <span className="text-bad-strong">*</span></label>
                <input id="l" className="input h-10" placeholder="e.g. Hosur, Bengaluru" value={locations} onChange={(e) => setLocations(e.target.value)} />
              </div>
            </div>
          </div>

          <div>
            <h2 className="flex items-center gap-2.5 font-bold text-[15px]"><Num n={3} /> Add supporting documents <span className="font-normal text-ink-muted">(optional)</span></h2>
            <label
              className="mt-3 flex items-center justify-center gap-3 rounded-xl border-2 border-dashed border-line hover:border-accent py-6 cursor-pointer"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); setFiles((f) => [...f, ...Array.from(e.dataTransfer.files)].slice(0, 5)); }}
            >
              <span className="w-11 h-11 rounded-xl bg-primary/[0.08] text-primary grid place-items-center"><Upload className="w-5 h-5" /></span>
              <span className="text-[13.5px]">
                Drop files here or <span className="text-accent font-semibold">click to upload</span>
                <span className="block text-[12px] text-ink-muted">Your line list, specs or questionnaire — Excel, PDF, Word or images</span>
              </span>
              <input ref={fileInput} type="file" multiple className="hidden" accept=".xlsx,.csv,.pdf,.docx,.jpg,.jpeg,.png,.txt" onChange={(e) => setFiles((f) => [...f, ...Array.from(e.target.files ?? [])].slice(0, 5))} />
            </label>
            {files.length > 0 && (
              <div className="grid sm:grid-cols-3 gap-2 mt-3">
                {files.map((f, i) => (
                  <div key={i} className="flex items-center gap-2.5 rounded-lg border border-line px-3 py-2">
                    {fileIcon(f.name)}
                    <div className="min-w-0 flex-1">
                      <div className="text-[12.5px] font-medium truncate">{f.name}</div>
                      <div className="text-[11.5px] text-ink-muted">{Math.max(1, Math.round(f.size / 1024))} KB</div>
                    </div>
                    <button onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`}><X className="w-4 h-4 text-ink-muted" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {err && <div className="chip chip-bad !whitespace-normal !rounded-md">{err}</div>}
          <div className="flex items-center justify-between gap-3 pt-1">
            <span className="text-[12.5px] text-ink-muted">{checks.missing ? `Add ${checks.req.filter((r) => !r.ok).map((r) => r.label.toLowerCase()).join(" and ")} for a stronger draft.` : "Ready to draft."}</span>
            <button className="btn-primary h-11 px-5 rounded-xl text-[14px]" disabled={drafting || (brief.trim().length < 8 && !files.length)} onClick={generate}>
              {drafting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} {drafting ? "Drafting your RFx…" : draft ? "Regenerate draft" : "Generate RFx draft"} {!drafting && <ArrowRight className="w-4 h-4" />}
            </button>
          </div>
        </section>

        <aside className="card shadow-sm flex flex-col xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)]">
          <header className="flex items-center gap-3 px-5 py-4 border-b border-line">
            <span className="w-11 h-11 rounded-full grid place-items-center text-white" style={{ background: "linear-gradient(135deg, rgb(var(--c-brand-mid)), rgb(var(--c-brand-end)))" }}><Sparkles className="w-5 h-5" /></span>
            <div className="flex-1">
              <div className="font-bold">RFx Copilot</div>
              <div className="text-[12.5px] text-ink-muted">Your AI sourcing assistant</div>
            </div>
            <button className="btn-ghost btn-sm" onClick={() => analyse(true)} title="Re-check my request" aria-label="Re-check my request"><MoreHorizontal className="w-4 h-4" /></button>
          </header>
          <div className="flex-1 overflow-auto px-5 py-4 space-y-3">
            {!brief.trim() ? (
              <p className="text-[13.5px] text-ink-muted">Tell me what you need on the left. I&apos;ll check it like a senior buyer would — specs, quantities, delivery, quality — before drafting, so supplier quotes come back comparable.</p>
            ) : (
              <>
                <div className="flex justify-end gap-2">
                  <div className="bg-surface-muted/70 rounded-2xl rounded-tr-sm px-3.5 py-2 text-[13px] max-w-[85%] line-clamp-4">{brief}</div>
                </div>
                {analysing && !summary && <div className="flex items-center gap-2 text-[13px] text-ink-muted"><Loader2 className="w-4 h-4 animate-spin" /> Reading your request…</div>}
                {summary && (
                  <div className="flex gap-2.5 text-[13.5px]">
                    <Sparkles className="w-5 h-5 text-brand-mid shrink-0 mt-0.5" />
                    <p>{qs.some((q) => !q.answer) ? `${summary.replace(/\.$/, "")}. A few things would make quotes comparable:` : `${summary}`}</p>
                  </div>
                )}
                {qs.map((q) => {
                  const K = KIND[q.kind] ?? KIND.specs;
                  const isOpen = open === q.id && !q.answer;
                  return (
                    <div key={q.id} className="rounded-xl border border-line overflow-hidden" style={{ background: q.answer ? "rgb(var(--c-success) / .06)" : K.tint }}>
                      <button className="w-full flex items-start gap-3 p-3.5 text-left" onClick={() => setOpen(isOpen ? null : q.id)} aria-expanded={isOpen}>
                        <span className="w-8 h-8 rounded-lg bg-surface grid place-items-center shrink-0 shadow-sm" style={{ color: q.answer ? "rgb(var(--c-success))" : K.color }}>{q.answer ? <Check className="w-4 h-4" /> : <K.icon className="w-4 h-4" />}</span>
                        <span className="flex-1 min-w-0">
                          <span className="block font-semibold text-[13.5px]">{q.title}</span>
                          <span className="block text-[12.5px] text-ink-muted mt-0.5">{q.answer ? `→ ${q.answer}` : q.detail}</span>
                        </span>
                        {!q.answer && <ChevronRight className={clsx("w-4 h-4 mt-1 text-ink-muted transition-transform", isOpen && "rotate-90")} />}
                      </button>
                      {isOpen && (
                        <div className="px-3.5 pb-3.5 pl-[58px] space-y-2">
                          <div className="flex flex-wrap gap-1.5">
                            {q.options.map((o) => (
                              <button key={o} className="chip chip-muted !py-1 !px-2.5 !text-[12.5px] !whitespace-normal text-left bg-surface hover:border-accent" onClick={() => { setQs(qs.map((x) => (x.id === q.id ? { ...x, answer: o } : x))); setOpen(null); }}>{o}</button>
                            ))}
                          </div>
                          <form onSubmit={(e) => { e.preventDefault(); const v = (e.currentTarget.elements.namedItem("a") as HTMLInputElement).value.trim(); if (v) { setQs(qs.map((x) => (x.id === q.id ? { ...x, answer: v } : x))); setOpen(null); } }}>
                            <input name="a" className="input h-9 bg-surface" placeholder="Or type your answer…" />
                          </form>
                        </div>
                      )}
                    </div>
                  );
                })}
                {notes.map((n, i) => (
                  <div key={i} className="flex justify-end"><div className="bg-surface-muted/70 rounded-2xl rounded-tr-sm px-3.5 py-2 text-[13px] max-w-[85%]">{n}</div></div>
                ))}
                {summary && (
                  <div>
                    <div className="text-[13px] font-semibold mb-2">You can also:</div>
                    <div className="flex flex-wrap gap-2">
                      <button className="chip chip-muted !py-1.5 !px-3 hover:border-accent" onClick={() => fileInput.current?.click()}>Attach my line list</button>
                      <button className="chip chip-brand !py-1.5 !px-3" onClick={generate} disabled={drafting}>{drafting ? "Drafting…" : "Generate for me anyway"}</button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
          <form
            className="p-4 border-t border-line flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!chat.trim()) return;
              if (!brief.trim()) setBrief(chat.trim());
              else setNotes([...notes, chat.trim()]);
              setChat("");
            }}
          >
            <input className="input h-11 rounded-xl" placeholder="Ask anything or add more details…" value={chat} onChange={(e) => setChat(e.target.value)} />
            <button className="btn-primary h-11 w-11 !px-0 rounded-xl" disabled={!chat.trim()} aria-label="Send"><Send className="w-4 h-4" /></button>
          </form>
        </aside>
      </div>

      {draft && (
        <div ref={editorRef} className="mt-8 scroll-mt-20">
          <h2 className="text-[20px] font-bold mb-1">Review your draft</h2>
          <p className="text-ink-muted mb-4 text-[14px]">Everything below is editable. Nothing goes to suppliers until you send it.</p>
          <RfxEditor key={JSON.stringify(draft).length + draft.title} suppliers={suppliers} initial={draft} />
        </div>
      )}
    </div>
  );
}
