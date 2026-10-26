"use client";
import { readJson } from "@/lib/read-json";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, RotateCcw, ShieldAlert } from "lucide-react";
import { Severity, fmtDateTime } from "./ui";

export type Exc = {
  id: string;
  severity: "critical" | "warning" | "info";
  status: "open" | "resolved" | "accepted_risk";
  title: string;
  explanation: string | null;
  suggested_resolution: string | null;
  resolution_note: string | null;
  resolved_at: string | null;
  type: string;
  supplierName?: string;
  lineNo?: number | null;
  href?: string;
};

export function ExceptionList({ items, showSupplier, compact }: { items: Exc[]; showSupplier?: boolean; compact?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function act(id: string, action: string) {
    setBusy(true);
    setErr(null);
    const res = await fetch(`/api/exceptions/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, note }) });
    const j = await readJson(res);
    setBusy(false);
    if (!res.ok) return setErr(j.error);
    setOpen(null);
    setNote("");
    router.refresh();
  }
  if (!items.length) return <div className="text-ink-muted text-[13px] py-3">No exceptions.</div>;
  return (
    <ul className="divide-y divide-line">
      {items.map((e) => (
        <li key={e.id} className={`py-2.5 ${e.status !== "open" ? "opacity-60" : ""}`}>
          <div className="flex items-start gap-2">
            <div className="pt-0.5"><Severity s={e.severity} /></div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-[13px] flex flex-wrap items-center gap-2">
                {showSupplier && e.supplierName && <span className="text-ink-muted font-normal">{e.supplierName} ·</span>}
                {e.href ? <a href={e.href} className="hover:text-accent">{e.title}</a> : e.title}
                {e.status === "resolved" && <span className="chip chip-ok"><CheckCircle2 className="w-3 h-3" /> resolved</span>}
                {e.status === "accepted_risk" && <span className="chip chip-warn"><ShieldAlert className="w-3 h-3" /> risk accepted</span>}
              </div>
              {!compact && e.explanation && <div className="text-[12.5px] text-ink-muted mt-0.5">{e.explanation}</div>}
              {e.status === "open" && e.suggested_resolution && <div className="text-[12px] mt-0.5"><span className="font-semibold">Next step:</span> {e.suggested_resolution}</div>}
              {e.status !== "open" && e.resolution_note && <div className="text-[12px] mt-0.5">Note: {e.resolution_note} <span className="text-ink-muted">({fmtDateTime(e.resolved_at)})</span></div>}
              {open === e.id && (
                <div className="mt-2 flex flex-wrap gap-2 items-center">
                  <input className="input max-w-sm" placeholder="Why? (required, goes to audit trail)" value={note} onChange={(x) => setNote(x.target.value)} />
                  <button className="btn-secondary btn-sm" disabled={busy} onClick={() => act(e.id, "resolve")}>{busy && <Loader2 className="w-3 h-3 animate-spin" />}Mark resolved</button>
                  <button className="btn-secondary btn-sm" disabled={busy} onClick={() => act(e.id, "accept_risk")}>Accept risk</button>
                  <button className="btn-ghost btn-sm" onClick={() => setOpen(null)}>Cancel</button>
                  {err && <span className="chip chip-bad">{err}</span>}
                </div>
              )}
            </div>
            <div className="shrink-0">
              {e.status === "open" && e.severity !== "info" && open !== e.id && (
                <button className="btn-ghost btn-sm" onClick={() => { setOpen(e.id); setErr(null); }}>Decide…</button>
              )}
              {e.status !== "open" && (
                <button className="btn-ghost btn-sm" title="Reopen" onClick={() => act(e.id, "reopen")}><RotateCcw className="w-3 h-3" /></button>
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
