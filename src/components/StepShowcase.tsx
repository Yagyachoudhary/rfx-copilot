"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { ArrowRight, Check, FileImage, FileSpreadsheet, FileText, FileType2, Inbox, Loader2, Mail, Scale, ShieldCheck, Sparkles, Wand2 } from "lucide-react";

export type ShowStep = {
  key: "draft" | "collect" | "fix" | "compare" | "ask";
  title: string;
  body: string;
  done?: boolean;
  href?: string;
  cta?: string;
  onClick?: () => void;
};

const META: Record<ShowStep["key"], { icon: any; color: string }> = {
  draft: { icon: Wand2, color: "rgb(var(--c-brand-mid))" },
  collect: { icon: Inbox, color: "rgb(var(--c-accent))" },
  fix: { icon: ShieldCheck, color: "rgb(var(--c-warning))" },
  compare: { icon: Scale, color: "rgb(var(--c-success))" },
  ask: { icon: Sparkles, color: "rgb(var(--c-brand-end))" },
};

export const DEFAULT_STEPS: ShowStep[] = [
  { key: "draft", title: "Draft your RFx with Copilot", body: "Describe what you need in one line. Copilot writes the line items, questionnaire and terms — you edit before anything goes out." },
  { key: "collect", title: "Collect replies in any format", body: "Excel that ignores your template, a PDF with footnotes, a phone photo, a one-line email. Every price is read and linked to where it came from." },
  { key: "fix", title: "Fix only what's flagged", body: "Duplicate prices, missing pack sizes, blurred photos. Each issue is one click, with the supplier's document open beside it." },
  { key: "compare", title: "Compare like for like", body: "Same lines, same units, same currency. Gaps stay visible — a missing quote is never a zero." },
  { key: "ask", title: "Ask, then decide", body: "“Cheapest per line among qualified vendors?” Copilot answers from your quotes and shows its maths. You make the call." },
];

export function StepShowcase({ steps = DEFAULT_STEPS, auto = false, initial }: { steps?: ShowStep[]; auto?: boolean; initial?: number }) {
  const firstOpen = initial ?? Math.max(0, steps.findIndex((s) => !s.done));
  const [active, setActive] = useState(firstOpen);
  const [paused, setPaused] = useState(!auto);
  useEffect(() => {
    if (paused) return;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setActive((a) => (a + 1) % steps.length), 5000);
    return () => clearInterval(t);
  }, [paused, steps.length]);
  const s = steps[active];

  return (
    <div className="grid lg:grid-cols-[1fr_1.05fr] gap-8 items-center">
      <ul className="divide-y divide-line" onMouseEnter={() => setPaused(true)}>
        {steps.map((st, i) => {
          const M = META[st.key];
          const on = i === active;
          return (
            <li key={st.key} className="relative">
              <button className="w-full text-left py-4 flex items-start gap-3.5" onClick={() => { setActive(i); setPaused(true); }} aria-expanded={on}>
                <span className="relative w-9 h-9 shrink-0 rounded-xl grid place-items-center transition-colors" style={{ background: on ? M.color : "transparent", color: on ? "#fff" : M.color, border: on ? "none" : `1.5px solid ${M.color}` }}>
                  <M.icon className="w-[18px] h-[18px]" />
                  {st.done && (
                    <span className="absolute -right-1.5 -bottom-1.5 w-4 h-4 rounded-full bg-ok text-white grid place-items-center ring-2 ring-surface"><Check className="w-2.5 h-2.5" /></span>
                  )}
                </span>
                <span className="min-w-0 pt-1.5">
                  <span className={clsx("block transition-all", on ? "text-[19px] font-bold text-ink" : "text-[16px] font-medium text-ink-muted", st.done && !on && "line-through decoration-ink-muted/40")}>{st.title}</span>
                  {on && <span className="block text-[14px] text-ink-muted mt-1.5 leading-relaxed max-w-md">{st.body}</span>}
                </span>
              </button>
              {on && (st.href || st.onClick) && (
                <div className="pl-[50px] pb-4 -mt-1">
                  {st.href ? (
                    <Link href={st.href} onClick={st.onClick} className="btn-primary">{st.cta ?? "Go"} <ArrowRight className="w-4 h-4" /></Link>
                  ) : (
                    <button onClick={st.onClick} className="btn-primary">{st.cta ?? "Go"} <ArrowRight className="w-4 h-4" /></button>
                  )}
                </div>
              )}
              {on && <span className="absolute left-0 right-0 -bottom-px h-[2px]" style={{ background: META[st.key].color }} />}
            </li>
          );
        })}
      </ul>
      <Visual k={s.key} />
    </div>
  );
}

function Stage({ children, a, b }: { children: React.ReactNode; a: string; b: string }) {
  return (
    <div className="relative rounded-[28px] overflow-hidden bg-surface-muted/50 min-h-[360px] p-6 sm:p-10 grid place-items-center">
      <div className="absolute -top-16 -left-10 w-72 h-72 rounded-full opacity-90" style={{ background: a }} />
      <div className="absolute -bottom-24 -right-16 w-96 h-80 rounded-[45%] opacity-90" style={{ background: b }} />
      <div className="relative w-full max-w-[400px] bg-surface rounded-2xl shadow-xl border border-line p-4 text-[12.5px]">{children}</div>
    </div>
  );
}

export function Visual({ k }: { k: ShowStep["key"] }) {
  if (k === "draft")
    return (
      <Stage a="rgb(var(--c-brand-mid) / .85)" b="rgb(var(--c-accent) / .55)">
        <div className="rounded-xl bg-surface-muted/60 px-3 py-2.5 text-ink">6-month rate contract for corrugated boxes for our Hosur DC</div>
        <div className="flex items-center gap-1.5 text-brand-mid font-semibold my-3"><Wand2 className="w-3.5 h-3.5" /> Copilot drafted</div>
        {[
          ["3-ply RSC 250×200×150", "40,000 pcs"],
          ["5-ply master carton 450×300×300", "25,000 pcs"],
          ["BOPP tape 48 mm × 65 m", "18,000 rolls"],
        ].map(([a, b]) => (
          <div key={a} className="flex justify-between border-b border-line py-2"><span>{a}</span><span className="text-ink-muted num">{b}</span></div>
        ))}
        <div className="flex gap-1.5 mt-3"><span className="chip chip-brand">30 lines</span><span className="chip chip-brand">8 questions</span><span className="chip chip-muted">editable</span></div>
      </Stage>
    );
  if (k === "collect")
    return (
      <Stage a="rgb(var(--c-accent) / .7)" b="rgb(var(--c-brand-mid) / .75)">
        {[
          [FileSpreadsheet, "text-ok-strong", "Shree Balaji", "Excel", "30/30"],
          [FileType2, "text-bad-strong", "Deccan", "PDF + certificate", "27/30"],
          [FileText, "text-brand-mid", "Pacific Pack", "Word · USD", "24/30"],
          [FileImage, "text-accent", "Hosur Box", "Phone photo", null],
          [Mail, "text-ink-muted", "Sri Lakshmi", "Email", "8/30"],
        ].map(([Icon, cls, name, fmt, cov]: any) => (
          <div key={name} className="flex items-center gap-2.5 py-2 border-b border-line last:border-0">
            <Icon className={clsx("w-4 h-4", cls)} />
            <span className="font-semibold flex-1">{name}</span>
            <span className="text-ink-muted">{fmt}</span>
            {cov ? <span className="chip chip-ok num">{cov}</span> : <span className="chip chip-info"><Loader2 className="w-3 h-3 animate-spin" /> reading</span>}
          </div>
        ))}
      </Stage>
    );
  if (k === "fix")
    return (
      <Stage a="rgb(var(--c-warning) / .7)" b="rgb(var(--c-brand-mid) / .7)">
        <div className="font-semibold">L8 master carton is priced twice</div>
        <div className="flex gap-2 mt-2">
          <span className="btn-secondary btn-sm num">₹41.50</span>
          <span className="btn-primary btn-sm num">₹39.80 ✓</span>
        </div>
        <div className="mt-3 rounded-md border border-line overflow-hidden text-[11.5px]">
          <div className="grid grid-cols-[28px_1fr_60px] bg-surface-muted/60 text-ink-muted"><span className="px-1">#</span><span className="px-1">Item</span><span className="px-1 text-right">Rate</span></div>
          <div className="grid grid-cols-[28px_1fr_60px]"><span className="px-1 text-ink-muted">12</span><span className="px-1">5 Ply Master Carton</span><span className="px-1 text-right num">41.50</span></div>
          <div className="grid grid-cols-[28px_1fr_60px] hl"><span className="px-1 text-ink-muted">38</span><span className="px-1">5 Ply Master (revised)</span><span className="px-1 text-right num font-semibold">39.80</span></div>
        </div>
        <div className="font-semibold mt-4">72 mm tape: how many per box?</div>
        <div className="flex items-center gap-2 mt-2"><span className="input w-16 grid items-center num">24</span><span className="text-ink-muted">rolls / box</span><span className="btn-primary btn-sm"><Check className="w-3.5 h-3.5" /></span></div>
      </Stage>
    );
  if (k === "compare")
    return (
      <Stage a="rgb(var(--c-success) / .7)" b="rgb(var(--c-brand-mid) / .75)">
        <div className="grid grid-cols-[1fr_repeat(3,64px)] text-ink-muted pb-1.5 border-b border-line"><span>Line</span><span className="text-right">Deccan</span><span className="text-right">Balaji</span><span className="text-right">Pacific</span></div>
        {[
          ["L1 3-ply 250×200", "9.26", "9.54", "8.84", 2],
          ["L8 Master carton", "34.87", "39.80", "decide", 0],
          ["L22 Sheet roll", "—", "639.15", "595.30", 2],
          ["L25 BOPP 48 mm", "33.64", "33.63", "31.62", 2],
        ].map(([l, a, b, c, best]: any) => (
          <div key={l} className="grid grid-cols-[1fr_repeat(3,64px)] py-1.5 border-b border-line last:border-0 num">
            <span className="text-ink">{l}</span>
            {[a, b, c].map((v: string, i: number) => (
              <span key={i} className={clsx("text-right px-1 rounded", i === best && v !== "decide" && "heat-1 font-bold text-ok-strong", v === "decide" && "text-warn-strong font-semibold", v === "—" && "text-ink-muted")}>{v}</span>
            ))}
          </div>
        ))}
        <div className="mt-3 space-y-1.5">
          {[["Deccan", 82, "₹1.20 Cr"], ["Shree Balaji", 92, "₹1.29 Cr"]].map(([n, w, v]: any, i) => (
            <div key={n} className="grid grid-cols-[72px_1fr_56px] items-center gap-2"><span>{n}</span><span className="h-3 rounded bg-surface-muted"><span className={clsx("block h-full rounded", i === 0 ? "bg-ok" : "bg-primary/35")} style={{ width: `${w}%` }} /></span><span className="num text-right">{v}</span></div>
          ))}
        </div>
      </Stage>
    );
  return (
    <Stage a="rgb(var(--c-brand-end) / .75)" b="rgb(var(--c-accent) / .6)">
      <div className="flex justify-end"><div className="bg-primary text-primary-fg rounded-2xl rounded-br-sm px-3 py-2 max-w-[85%]">Cheapest per line, only among vendors who cleared the questionnaire?</div></div>
      <div className="mt-3 space-y-1.5">
        {["Qualification by supplier", "Per-line winner, qualified only", "Freight-adjusted split"].map((q) => (
          <div key={q} className="flex items-center gap-2 text-ink-muted"><Check className="w-3.5 h-3.5 text-ok-strong" /> {q}</div>
        ))}
      </div>
      <div className="mt-3 rounded-lg bg-surface-muted/60 p-3">
        <div className="font-semibold">Split between 2 qualified vendors: ₹1.43 Cr</div>
        <div className="text-ink-muted mt-0.5">Saves ₹5.5 L (3.7%) vs. a single award, after Deccan&apos;s 2.5% freight. Both qualify on unverified claims.</div>
      </div>
    </Stage>
  );
}

/** Rotating product visual (used on the sign-in page). */
export function RotatingVisual() {
  const keys: ShowStep["key"][] = ["collect", "fix", "compare", "ask"];
  const [i, setI] = useState(0);
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setI((x) => (x + 1) % keys.length), 4500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <Visual k={keys[i]} />;
}
