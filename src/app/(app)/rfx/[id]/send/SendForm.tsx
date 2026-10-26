"use client";
import { readJson } from "@/lib/read-json";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Mail, Send } from "lucide-react";
import { fmtDateTime } from "@/components/ui";

type Inv = { id: string; supplierId: string; name: string; email: string | null; contact: string | null; delivery_status: string; response_status: string; invited_at: string | null; channel: string };

export function SendForm({ rfqId, status, defaultSubject, defaultBody, invites, lines, questions }: { rfqId: string; status: string; defaultSubject: string; defaultBody: string; invites: Inv[]; lines: number; questions: number }) {
  const router = useRouter();
  const [channel, setChannel] = useState("email_simulated");
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);
  const [sel, setSel] = useState<string[]>(invites.filter((i) => i.delivery_status === "not_sent").map((i) => i.supplierId));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const ready = lines > 0 && sel.length > 0;
  const preview = invites.find((i) => sel.includes(i.supplierId)) ?? invites[0];
  return (
    <div className="grid lg:grid-cols-[1fr_380px] gap-5">
      <div className="space-y-4">
        <section className="card p-4">
          <h2 className="font-semibold mb-3">Pre-send checks</h2>
          <ul className="space-y-1.5 text-[13px]">
            <li className="flex items-center gap-2"><CheckCircle2 className={`w-4 h-4 ${lines ? "text-ok-strong" : "text-ink-muted"}`} /> {lines} line items</li>
            <li className="flex items-center gap-2"><CheckCircle2 className={`w-4 h-4 ${questions ? "text-ok-strong" : "text-ink-muted"}`} /> {questions} questionnaire items</li>
            <li className="flex items-center gap-2"><CheckCircle2 className={`w-4 h-4 ${sel.length ? "text-ok-strong" : "text-ink-muted"}`} /> {sel.length} supplier(s) selected</li>
          </ul>
        </section>
        <section className="card p-4 space-y-3">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="label">Channel</label>
              <select className="input w-64" value={channel} onChange={(e) => setChannel(e.target.value)}>
                <option value="email_simulated">Email (simulated in prototype)</option>
                <option value="portal_simulated">Supplier portal link (simulated)</option>
              </select>
            </div>
            <p className="text-[12px] text-ink-muted max-w-sm">No email leaves this prototype. Sending records the invitation, recipients and timestamps so response tracking works end to end.</p>
          </div>
          <div>
            <label className="label">Subject</label>
            <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div>
            <label className="label">Message (placeholders: {"{supplier_name}"}, {"{contact_name}"})</label>
            <textarea className="input min-h-[220px] font-mono text-[12px]" value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
          {preview && (
            <details className="text-[12px]">
              <summary className="cursor-pointer text-ink-muted">Preview for {preview.name}</summary>
              <pre className="whitespace-pre-wrap bg-surface-muted/40 p-3 rounded mt-2">{body.replaceAll("{supplier_name}", preview.name).replaceAll("{contact_name}", preview.contact ?? "Sir/Madam")}</pre>
            </details>
          )}
        </section>
      </div>
      <aside className="card p-4 h-fit space-y-3">
        <h2 className="font-semibold">Recipients</h2>
        {invites.length === 0 && <p className="text-ink-muted text-[13px]">No suppliers on this event. Add them on the Overview tab.</p>}
        <div className="space-y-2">
          {invites.map((i) => (
            <label key={i.id} className="flex items-start gap-2 text-[13px] border border-line rounded-md p-2">
              <input type="checkbox" className="mt-1" checked={sel.includes(i.supplierId)} onChange={(e) => setSel(e.target.checked ? [...sel, i.supplierId] : sel.filter((x) => x !== i.supplierId))} />
              <span className="flex-1 min-w-0">
                <span className="font-semibold block">{i.name}</span>
                <span className="text-ink-muted block truncate"><Mail className="w-3 h-3 inline mr-1" />{i.email ?? "no email"}</span>
                <span className="text-[11px] block mt-0.5">
                  {i.delivery_status === "not_sent" ? <span className="chip chip-muted">not sent</span> : <span className="chip chip-ok">{i.delivery_status} · {fmtDateTime(i.invited_at)}</span>}{" "}
                  {i.response_status === "responded" && <span className="chip chip-brand">responded</span>}
                </span>
              </span>
            </label>
          ))}
        </div>
        <button
          className="btn-primary w-full h-9"
          disabled={!ready || busy}
          onClick={async () => {
            setBusy(true);
            setErr(null);
            const res = await fetch(`/api/rfx/${rfqId}/send`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ channel, supplierIds: sel, subject, body }) });
            const j = await readJson(res);
            setBusy(false);
            if (!res.ok) return setErr(j.error);
            setMsg(`Sent to ${j.sent} supplier(s) (simulated) at ${fmtDateTime(j.at)}`);
            setSel([]);
            router.refresh();
          }}
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} {status === "draft" ? "Send RFx" : "Send to selected"}
        </button>
        {msg && <div className="chip chip-ok !whitespace-normal">{msg}</div>}
        {err && <div className="chip chip-bad !whitespace-normal">{err}</div>}
      </aside>
    </div>
  );
}
