"use client";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { StepShowcase, type ShowStep } from "./StepShowcase";
import { openCopilot } from "./Copilot";

type Flags = { rfqId: string; received: boolean; fixed: boolean; asked: boolean; decided: boolean };

const get = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};

export function GettingStarted({ f }: { f: Flags }) {
  const [compared, setCompared] = useState(false);
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    setCompared(get(`rfxc:compared:${f.rfqId}`) === "1");
    setHidden(get("rfxc:guide-dismissed") === "1");
  }, [f.rfqId]);
  const base = `/rfx/${f.rfqId}`;
  const steps: ShowStep[] = [
    { key: "collect", title: "Receive the 5 supplier replies", body: "Excel, a PDF with footnotes, a Word letter in dollars, a phone photo and a one-line email. Each is read in about a minute.", done: f.received, href: `${base}/responses`, cta: "Open responses" },
    { key: "fix", title: "Fix what's flagged", body: "A price quoted twice, a box with no pack size, blurred rates. One click each, with the supplier's document open beside it.", done: f.fixed, href: `${base}/responses`, cta: "Fix issues" },
    { key: "compare", title: "Compare like for like", body: "Every supplier on the same 30 lines, in rupees, ex-GST. The cheapest price per line is highlighted; gaps stay visible.", done: compared, href: `${base}/compare`, cta: "Compare prices" },
    { key: "ask", title: "Ask Copilot the VP's question", body: "“Cheapest per line, only among vendors who cleared the questionnaire?” Copilot answers from your quotes and shows each calculation.", done: f.asked, href: `${base}/compare`, cta: "Ask Copilot", onClick: () => setTimeout(() => openCopilot("Cheapest per line, but only among vendors who cleared the questionnaire?"), 700) },
    { key: "draft", title: "Draft your own RFx", body: "Describe what you buy in one line — Copilot drafts the lines, questionnaire and terms for you to edit.", done: f.decided, href: "/rfx/new", cta: "Draft an RFx" },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  if (hidden || doneCount === steps.length) return null;
  return (
    <section className="card p-6 mb-6">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <h2 className="font-bold text-[18px]">Get started</h2>
          <p className="text-ink-muted text-[13px]">{doneCount} of {steps.length} done · about 5 minutes with the sample event</p>
        </div>
        <button
          className="btn-ghost btn-sm"
          aria-label="Hide guide"
          onClick={() => {
            try {
              localStorage.setItem("rfxc:guide-dismissed", "1");
            } catch {}
            setHidden(true);
          }}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <StepShowcase steps={steps} />
    </section>
  );
}

/** Marks the compare step as seen for the guide. */
export function MarkCompared({ rfqId }: { rfqId: string }) {
  useEffect(() => {
    try {
      localStorage.setItem(`rfxc:compared:${rfqId}`, "1");
    } catch {}
  }, [rfqId]);
  return null;
}
