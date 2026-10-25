"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, PlayCircle } from "lucide-react";
import { StepShowcase } from "@/components/StepShowcase";

export default function OnboardingForm({ email }: { email: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "demo" | "blank">(null);
  const [err, setErr] = useState<string | null>(null);
  async function start(seed: boolean) {
    setBusy(seed ? "demo" : "blank");
    setErr(null);
    const domain = email.split("@")[1]?.split(".")[0];
    const name = seed ? "Nilgiri Consumer Foods (Demo)" : domain ? domain[0].toUpperCase() + domain.slice(1) : "My company";
    const res = await fetch("/api/onboarding", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, seed }) });
    const j = await res.json();
    setBusy(null);
    if (!res.ok) return setErr(j.error ?? "Something went wrong");
    router.push(j.rfqId ? `/rfx/${j.rfqId}/responses` : "/rfx/new");
    router.refresh();
  }
  return (
    <div className="w-full max-w-6xl mx-auto">
      <div className="flex items-center gap-2 font-bold text-[15px] mb-10">
        <span className="w-7 h-7 rounded-lg grid place-items-center text-white" style={{ background: "var(--nav-gradient)" }}>
          <svg viewBox="0 0 16 16" className="w-4 h-4" fill="currentColor"><path d="M8 1l1.6 4.4L14 7l-4.4 1.6L8 13l-1.6-4.4L2 7l4.4-1.6z" /></svg>
        </span>
        RFx Copilot
      </div>
      <header className="text-center max-w-3xl mx-auto">
        <h1 className="text-[36px] sm:text-[52px] font-extrabold leading-[1.05] tracking-tight text-ink">RFx Copilot makes quote comparison simple</h1>
        <p className="mt-5 text-[17px] text-ink-muted leading-relaxed">
          Suppliers reply in Excel, PDFs, photos and emails. RFx Copilot reads every quote, lines them up, and shows you only what needs a decision — so you stop retyping and start deciding.
        </p>
        <div className="mt-8 flex flex-col items-center gap-3">
          <button className="btn-primary h-12 px-7 text-[15px] rounded-xl" disabled={!!busy} onClick={() => start(true)}>
            {busy === "demo" ? <Loader2 className="w-5 h-5 animate-spin" /> : <PlayCircle className="w-5 h-5" />} Try it with a sample event
          </button>
          <button className="text-[13.5px] text-ink-muted hover:text-accent" disabled={!!busy} onClick={() => start(false)}>
            {busy === "blank" ? "Setting up…" : "or start empty and draft your own RFx"}
          </button>
          {err && <div className="chip chip-bad !whitespace-normal !rounded-md">{err}</div>}
        </div>
      </header>
      <section className="mt-16">
        <StepShowcase auto />
      </section>
      <p className="text-center text-[12px] text-ink-muted mt-10">Sample suppliers, documents and prices are fictional. Your workspace is private to your account.</p>
    </div>
  );
}
