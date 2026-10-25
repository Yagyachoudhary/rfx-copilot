"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sparkles, Trash2, Wand2, X } from "lucide-react";
import clsx from "clsx";
import { AskBox, Conversation, useCopilot } from "./CopilotChat";

const STEP_PROMPTS: Record<string, string[]> = {
  overview: ["Summarise this event in three lines", "Which questionnaire items are must-pass?"],
  send: ["Who hasn't replied yet?", "Summarise this event in three lines"],
  responses: ["What's blocking the comparison right now?", "Which suppliers quoted fewer than 30 lines, and what's missing?", "Which values have low confidence or no source?"],
  exceptions: ["What's blocking the comparison right now?", "Which issues are critical and why?"],
  compare: ["Who is cheapest on the lines everyone quoted? Show the maths.", "Where do suppliers differ the most on price?", "Chart total cost by supplier on the common lines"],
  decision: ["Cheapest per line, but only among vendors who cleared the questionnaire?", "What changes if freight is included?", "Compare the cheapest supplier with the best-qualified one"],
  analyst: ["Cheapest per line, but only among vendors who cleared the questionnaire?", "Export a comparison table with raw quote, normalized price and source"],
};

const NEW_RFX_EXAMPLES = [
  "6-month rate contract for corrugated boxes for our Hosur DC — 3-ply and 5-ply cartons, BOPP tape, stretch film",
  "Annual MRO spares for 2 bottling lines: bearings, belts, seals — ISO-certified suppliers within 200 km",
  "Laptops for 120 new hires: 16 GB RAM, 512 GB SSD, 3-year warranty, delivery to Bengaluru and Pune",
];

export function CopilotLauncher() {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const m = path.match(/^\/rfx\/([0-9a-f-]{36})(?:\/([a-z]+))?/);
  const rfqId = m?.[1] ?? null;
  const step = m ? m[2] ?? "overview" : null;
  const { msgs, busy, ask, clear } = useCopilot(open ? rfqId : null);

  useEffect(() => {
    const h = (e: Event) => {
      setOpen(true);
      const q = (e as CustomEvent).detail?.question;
      if (q) setTimeout(() => window.dispatchEvent(new CustomEvent("copilot:ask-now", { detail: q })), 300);
    };
    window.addEventListener("copilot:open", h);
    return () => window.removeEventListener("copilot:open", h);
  }, []);
  useEffect(() => {
    const h = (e: Event) => ask((e as CustomEvent).detail);
    window.addEventListener("copilot:ask-now", h);
    return () => window.removeEventListener("copilot:ask-now", h);
  }, [ask]);

  if ((path.startsWith("/rfx/") && path.endsWith("/analyst")) || path === "/rfx/new") return null; // copilot already on the page
  const prompts = step ? STEP_PROMPTS[step] ?? STEP_PROMPTS.responses : [];

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed z-40 right-5 bottom-5 flex items-center gap-2 pl-3 pr-4 h-11 rounded-full text-white font-semibold shadow-lg hover:shadow-xl transition-shadow"
          style={{ background: "var(--nav-gradient)" }}
        >
          <Sparkles className="w-4 h-4" /> Copilot
        </button>
      )}
      {open && (
        <aside className="fixed z-50 right-0 top-0 h-full w-full sm:w-[420px] bg-surface border-l border-line shadow-2xl flex flex-col" aria-label="Copilot">
          <header className="flex items-center gap-2 px-4 h-14 border-b border-line">
            <span className="w-7 h-7 rounded-lg grid place-items-center text-white" style={{ background: "var(--nav-gradient)" }}><Sparkles className="w-4 h-4" /></span>
            <div className="flex-1 min-w-0">
              <div className="font-bold leading-tight">Copilot</div>
              <div className="text-[12px] text-ink-muted">{rfqId ? "Answers from this event's quotes" : "Drafts RFx events from a plain brief"}</div>
            </div>
            {rfqId && msgs.length > 0 && <button className="btn-ghost btn-sm" onClick={clear} title="Clear conversation" aria-label="Clear conversation"><Trash2 className="w-3.5 h-3.5" /></button>}
            <button className="btn-ghost btn-sm" onClick={() => setOpen(false)} aria-label="Close copilot"><X className="w-4 h-4" /></button>
          </header>

          <div className="flex-1 overflow-auto p-4">
            {rfqId ? (
              msgs.length ? (
                <Conversation msgs={msgs} compact />
              ) : (
                <div className="space-y-3">
                  <p className="text-[13.5px]">Ask about prices, gaps, suppliers or trade-offs. I calculate every number from the quotes in this event, and you can open each calculation.</p>
                  <div className="space-y-2">
                    {prompts.map((p) => (
                      <button key={p} disabled={busy} onClick={() => ask(p)} className="w-full text-left card px-3 py-2.5 text-[13px] hover:border-accent">{p}</button>
                    ))}
                  </div>
                </div>
              )
            ) : (
              <div className="space-y-3">
                <p className="text-[13.5px]">Tell me what you need to buy. I&apos;ll draft the RFx — line items, questionnaire, terms — and you edit before anything is sent.</p>
                <div className="space-y-2">
                  {NEW_RFX_EXAMPLES.map((p) => (
                    <button key={p} onClick={() => { setOpen(false); router.push(`/rfx/new?brief=${encodeURIComponent(p)}`); }} className="w-full text-left card px-3 py-2.5 text-[13px] hover:border-accent flex gap-2">
                      <Wand2 className="w-4 h-4 shrink-0 text-brand-mid mt-0.5" /> {p}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className={clsx("border-t border-line p-3", rfqId && msgs.length > 0 && "space-y-2")}>
            {rfqId && msgs.length > 0 && (
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {prompts.slice(0, 2).map((p) => (
                  <button key={p} disabled={busy} onClick={() => ask(p)} className="chip chip-muted shrink-0 hover:border-accent">{p}</button>
                ))}
              </div>
            )}
            {rfqId ? (
              <AskBox onAsk={ask} busy={busy} placeholder="Ask about this event…" />
            ) : (
              <AskBox onAsk={(q) => { setOpen(false); router.push(`/rfx/new?brief=${encodeURIComponent(q)}`); }} busy={false} placeholder="What do you need to buy?" />
            )}
          </div>
        </aside>
      )}
    </>
  );
}

/** Any button can open the copilot (optionally with a question). */
export function openCopilot(question?: string) {
  window.dispatchEvent(new CustomEvent("copilot:open", { detail: { question } }));
}

export function CopilotButton({ label = "Ask Copilot", question, className }: { label?: string; question?: string; className?: string }) {
  return (
    <button className={className ?? "btn-secondary"} onClick={() => openCopilot(question)}>
      <Sparkles className="w-4 h-4 text-brand-mid" /> {label}
    </button>
  );
}
