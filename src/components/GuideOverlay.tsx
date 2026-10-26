"use client";
import { readJson } from "@/lib/read-json";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import { StepShowcase, type ShowStep } from "./StepShowcase";
import { openCopilot } from "./Copilot";

/** Opens the guided tour on top of whatever page the user is on. */
export function openGuide() {
  window.dispatchEvent(new CustomEvent("guide:open"));
}

/**
 * The "Show me around" tour. Works on every page, with or without an event:
 * with no event yet, the first step loads the free sample event.
 */
export function GuideOverlay({ latestRfqId }: { latestRfqId: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const h = () => setOpen(true);
    window.addEventListener("guide:open", h);
    return () => window.removeEventListener("guide:open", h);
  }, []);
  // Close once a step's button has taken the user somewhere.
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open]);

  if (!open) return null;

  async function loadSample() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/demo/seed", { method: "POST" });
      const j = await readJson(res);
      if (!res.ok) throw new Error(j.error ?? "Could not load the sample event");
      router.push(`/rfx/${j.rfqId}/responses`);
      router.refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Could not load the sample event");
    } finally {
      setBusy(false);
    }
  }

  const base = latestRfqId ? `/rfx/${latestRfqId}` : null;
  const steps: ShowStep[] = [
    base
      ? { key: "collect", title: "Receive the supplier replies", body: "Excel, a PDF with footnotes, a Word letter in dollars, a phone photo and a one-line email. Each is read with a source for every value.", href: `${base}/responses`, cta: "Open responses" }
      : { key: "collect", title: "Load the sample event", body: "A fictional 30-line packaging RFQ with five supplier replies in five formats. Free to run: no AI credit is used for the sample files.", onClick: loadSample, cta: busy ? "Loading…" : "Start with the sample" },
    { key: "fix", title: "Fix what's flagged", body: "A price quoted twice, a box with no pack size, blurred rates. One click each, with the supplier's document open beside it.", href: base ? `${base}/responses` : undefined, cta: base ? "Fix issues" : undefined },
    { key: "compare", title: "Compare like for like", body: "Every supplier on the same lines, in rupees, ex-GST. The cheapest price per line is highlighted; gaps stay visible.", href: base ? `${base}/compare` : undefined, cta: base ? "Compare prices" : undefined },
    {
      key: "ask",
      title: "Ask the AI Analyst",
      body: "“Cheapest per line, only among vendors who cleared the questionnaire?” Answers come from your quotes, with each calculation shown. Uses AI credit.",
      href: base ? `${base}/compare` : undefined,
      cta: base ? "Ask a question" : undefined,
      onClick: base ? () => setTimeout(() => openCopilot("Cheapest per line, but only among vendors who cleared the questionnaire?"), 700) : undefined,
    },
    { key: "draft", title: "Draft your own RFx", body: "Describe what you buy in one line; Copilot asks what's missing and drafts the lines, questionnaire and terms for you to edit.", href: "/rfx/new", cta: "Draft an RFx" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Product tour">
      <div className="absolute inset-0 bg-ink/40" onClick={() => setOpen(false)} />
      <div className="relative card w-full max-w-4xl max-h-[90vh] overflow-auto p-6">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div>
            <h2 className="font-bold text-[18px]">A 5-minute tour</h2>
            <p className="text-ink-muted text-[13px]">From supplier replies to a defensible award. Pick a step to jump there.</p>
          </div>
          <button className="btn-ghost btn-sm" aria-label="Close tour" onClick={() => setOpen(false)}>
            <X className="w-4 h-4" />
          </button>
        </div>
        {busy && (
          <div className="flex items-center gap-2 text-[13px] text-ink-muted mb-2"><Loader2 className="w-4 h-4 animate-spin" /> Setting up the sample event…</div>
        )}
        {err && <div className="chip-bad chip !rounded-md !whitespace-normal !text-[12px] w-full mb-2">{err}</div>}
        <StepShowcase steps={steps} initial={0} />
      </div>
    </div>
  );
}
