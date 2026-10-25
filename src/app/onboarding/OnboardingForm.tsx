"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function OnboardingForm({ email }: { email: string }) {
  const router = useRouter();
  const [name, setName] = useState("Nilgiri Consumer Foods (Demo)");
  const [fullName, setFullName] = useState("");
  const [seed, setSeed] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <form
      className="card w-full max-w-md p-6 space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        const res = await fetch("/api/onboarding", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, fullName, seed }) });
        const j = await res.json();
        setBusy(false);
        if (!res.ok) return setErr(j.error ?? "Failed");
        router.push(j.rfqId ? `/rfx/${j.rfqId}/responses` : "/");
        router.refresh();
      }}
    >
      <div>
        <h1 className="text-xl font-bold">Set up your workspace</h1>
        <p className="text-ink-muted text-[13px] mt-1">Signed in as {email}. Your data is isolated to this workspace (row-level security).</p>
      </div>
      <div>
        <label className="label">Organization name</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div>
        <label className="label">Your name (optional)</label>
        <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
      </div>
      <label className="flex items-start gap-2 text-[13px]">
        <input type="checkbox" className="mt-1" checked={seed} onChange={(e) => setSeed(e.target.checked)} />
        <span>
          Load the demo sourcing event: corrugated packaging, 30 lines, 5 suppliers, questionnaire. <span className="text-ink-muted">No prices are seeded — supplier responses arrive as real documents and are extracted live.</span>
        </span>
      </label>
      {err && <div className="chip chip-bad !whitespace-normal !rounded-md w-full">{err}</div>}
      <button className="btn-primary w-full h-9" disabled={busy}>
        {busy && <Loader2 className="w-4 h-4 animate-spin" />} Create workspace
      </button>
    </form>
  );
}
