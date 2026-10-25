"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Download, FileImage, FileSpreadsheet, FileText, FileType2, History, Loader2, Mail, RotateCw, Upload, X, Zap } from "lucide-react";
import clsx from "clsx";
import { fmtDateTime } from "@/components/ui";

const BUSY = ["received", "parsing", "extracting", "normalizing"];

function FileIcon({ name, className = "w-4 h-4" }: { name: string; className?: string }) {
  const n = name.toLowerCase();
  if (/\.(xlsx|csv)$/.test(n)) return <FileSpreadsheet className={clsx(className, "text-ok-strong")} />;
  if (/\.(jpe?g|png|webp)$/.test(n)) return <FileImage className={clsx(className, "text-accent")} />;
  if (/\.pdf$/.test(n)) return <FileType2 className={clsx(className, "text-bad-strong")} />;
  if (/\.(eml|txt)$/.test(n)) return <Mail className={clsx(className, "text-ink-muted")} />;
  return <FileText className={clsx(className, "text-brand-mid")} />;
}

function Coverage({ s }: { s: any }) {
  const total = s?.total_lines ?? 30;
  const ok = s?.comparable ?? 0;
  const rev = Math.max(0, (s?.covered_lines ?? 0) - ok);
  const pct = (n: number) => `${(n / total) * 100}%`;
  return (
    <div>
      <div className="flex items-baseline gap-1">
        <span className="text-[26px] font-bold num leading-none">{s?.covered_lines ?? 0}</span>
        <span className="text-ink-muted num">/ {total} lines</span>
      </div>
      <div className="flex h-1.5 mt-2 rounded-full overflow-hidden bg-surface-muted" title={`${ok} comparable · ${rev} need a decision · ${total - (s?.covered_lines ?? 0)} not quoted`}>
        <div className="bg-ok" style={{ width: pct(ok) }} />
        <div className="bg-warn" style={{ width: pct(rev) }} />
      </div>
    </div>
  );
}

export function Inbox({ rfqId, rows, isDemo }: { rfqId: string; rows: any[]; isDemo: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [uploadFor, setUploadFor] = useState<any | null>(null);
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const processing = rows.some((r) => r.responses.some((x: any) => x.is_active && BUSY.includes(x.status)));
  useEffect(() => {
    if (!processing) return;
    const t = setInterval(() => router.refresh(), 2500);
    return () => clearInterval(t);
  }, [processing, router]);
  const pending = useMemo(() => rows.flatMap((r) => r.samples.filter((s: any) => !s.isCorrection && !r.responses.some((x: any) => x.version >= s.version))), [rows]);
  const totalIssues = rows.reduce((a, r) => a + (r.responses.find((x: any) => x.is_active)?.issues ?? 0), 0);

  async function call(key: string, url: string, body?: any) {
    setBusy(key);
    setErr(null);
    try {
      const res = await fetch(url, { method: "POST", headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Failed");
      router.refresh();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-[16px] font-semibold mr-auto">Supplier responses</h2>
        {totalIssues > 0 && <Link href={`/rfx/${rfqId}/exceptions`} className="btn-ghost">All {totalIssues} issues</Link>}
        {isDemo && pending.length > 0 && (
          <button
            className="btn-primary"
            disabled={!!busy}
            onClick={async () => {
              setBusy("all");
              setErr(null);
              try {
                for (const s of pending) {
                  const res = await fetch(`/api/rfx/${rfqId}/responses`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sample: s.index }) });
                  if (!res.ok) throw new Error((await res.json()).error);
                }
                router.refresh();
              } catch (e: any) {
                setErr(e.message);
              } finally {
                setBusy(null);
              }
            }}
          >
            {busy === "all" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />} Receive {pending.length} demo responses
          </button>
        )}
      </div>
      {err && <div className="chip chip-bad !whitespace-normal">{err}</div>}

      <div className="grid sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5 gap-3">
        {rows.map((r) => {
          const act = r.responses.find((x: any) => x.is_active);
          const older = r.responses.filter((x: any) => !x.is_active);
          const next = r.samples.find((s: any) => !r.responses.some((x: any) => x.version >= s.version));
          const isBusy = act && BUSY.includes(act.status);
          return (
            <article key={r.supplier.id} className={clsx("card p-4 flex flex-col gap-3", act?.status === "failed" && "border-bad/50")}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-semibold leading-tight truncate" title={r.supplier.name}>{r.supplier.name}</h3>
                  <div className="text-[12px] text-ink-muted truncate">{r.supplier.location}</div>
                </div>
                {act && act.version > 1 && (
                  <button className="chip chip-info shrink-0" onClick={() => setHistoryFor(historyFor === r.supplier.id ? null : r.supplier.id)} title="Version history">
                    <History className="w-3 h-3" /> v{act.version}
                  </button>
                )}
              </div>

              {!act ? (
                <div className="flex-1 flex flex-col justify-center items-center text-center py-4 rounded-md border border-dashed border-line">
                  <Mail className="w-5 h-5 text-ink-muted" />
                  <div className="text-[13px] text-ink-muted mt-1">{r.invite.delivery_status === "not_sent" ? "Not invited yet" : "Waiting for reply"}</div>
                </div>
              ) : isBusy ? (
                <div className="flex-1 flex flex-col justify-center gap-2 py-4">
                  <div className="flex items-center gap-2 text-[13px] font-semibold"><Loader2 className="w-4 h-4 animate-spin text-accent" /> Reading {act.files.length > 1 ? `${act.files.length} files` : "file"}…</div>
                  <div className="h-1.5 rounded-full bg-surface-muted overflow-hidden"><div className="h-full bg-accent animate-pulse" style={{ width: act.status === "normalizing" ? "85%" : act.status === "extracting" ? "55%" : "20%" }} /></div>
                  <div className="text-[12px] text-ink-muted capitalize">{act.status}</div>
                </div>
              ) : act.status === "failed" ? (
                <div className="flex-1 py-2">
                  <div className="flex items-center gap-1.5 text-bad-strong font-semibold text-[13px]"><AlertTriangle className="w-4 h-4" /> Couldn&apos;t read this response</div>
                  <div className="text-[12px] text-ink-muted mt-1 line-clamp-3" title={act.error}>{act.error}</div>
                </div>
              ) : (
                <Coverage s={act.summary} />
              )}

              {act && (
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {act.files.map((f: any) => (
                    <a key={f.id} href={`/api/files/${f.id}`} target="_blank" className="inline-flex items-center gap-1 text-[12px] text-ink-muted hover:text-accent max-w-full" title={`${f.file_name} · received ${fmtDateTime(act.received_at)} via ${act.channel}`}>
                      <FileIcon name={f.file_name} className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">{f.file_name}</span>
                    </a>
                  ))}
                </div>
              )}

              {historyFor === r.supplier.id && older.length > 0 && (
                <div className="rounded-md bg-surface-muted/50 p-2 text-[12px] space-y-1">
                  {older.map((o: any) => (
                    <div key={o.id} className="flex items-center gap-2">
                      <span className="font-semibold">v{o.version}</span>
                      <span className="text-ink-muted">{fmtDateTime(o.received_at)}</span>
                      <button className="ml-auto text-accent font-semibold" onClick={() => call(o.id, `/api/responses/${o.id}/activate`)}>Use this version</button>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-auto flex items-center gap-2 pt-1">
                {act && !isBusy && act.status !== "failed" && (
                  act.issues > 0 ? (
                    <Link href={`/rfx/${rfqId}/responses/${act.id}`} className="btn-primary flex-1"><AlertTriangle className="w-4 h-4" /> Fix {act.issues} issue{act.issues > 1 ? "s" : ""}</Link>
                  ) : (
                    <Link href={`/rfx/${rfqId}/responses/${act.id}`} className="btn-secondary flex-1"><CheckCircle2 className="w-4 h-4 text-ok-strong" /> Ready · view</Link>
                  )
                )}
                {act?.status === "failed" && (
                  <button className="btn-primary flex-1" disabled={!!busy} onClick={() => call(act.id, `/api/responses/${act.id}/process`)}>
                    {busy === act.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCw className="w-4 h-4" />} Retry
                  </button>
                )}
                {next && !isBusy && (
                  <button className={clsx(act ? "btn-secondary" : "btn-primary", "flex-1")} disabled={!!busy} onClick={() => call("s" + next.index, `/api/rfx/${rfqId}/responses`, { sample: next.index })} title={next.files.map((f: any) => f.name).join(", ")}>
                    {busy === "s" + next.index ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />} {next.isCorrection ? "Receive revision" : "Receive reply"}
                  </button>
                )}
                <button className="btn-ghost px-2" onClick={() => setUploadFor(r.supplier)} title="Upload files" aria-label="Upload files"><Upload className="w-4 h-4" /></button>
              </div>
            </article>
          );
        })}
      </div>
      {isDemo && (
        <details className="text-[12px] text-ink-muted">
          <summary className="cursor-pointer">Download the demo files to try uploading them yourself</summary>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
            {rows.flatMap((r) => r.samples.flatMap((s: any) => s.files)).map((f: any) => (
              <a key={f.path} className="inline-flex items-center gap-1 hover:text-accent" href={`/api/demo/samples?path=${encodeURIComponent(f.path)}`}><Download className="w-3 h-3" /> {f.name}</a>
            ))}
          </div>
        </details>
      )}
      {uploadFor && <UploadDialog rfqId={rfqId} supplier={uploadFor} onClose={() => setUploadFor(null)} onDone={() => { setUploadFor(null); router.refresh(); }} />}
    </div>
  );
}

function UploadDialog({ rfqId, supplier, onClose, onDone }: { rfqId: string; supplier: any; onClose: () => void; onDone: () => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" role="dialog" aria-modal="true">
      <div className="card w-full max-w-md p-5 space-y-4 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="font-bold">Add a reply from {supplier.name}</h3>
          <button className="btn-ghost btn-sm" onClick={onClose} aria-label="Close"><X className="w-4 h-4" /></button>
        </div>
        <label className="block rounded-lg border-2 border-dashed border-line p-6 text-center cursor-pointer hover:border-accent">
          <Upload className="w-6 h-6 mx-auto text-ink-muted" />
          <div className="text-[13px] mt-2 font-semibold">{files.length ? files.map((f) => f.name).join(", ") : "Drop or choose files"}</div>
          <div className="text-[12px] text-ink-muted">Excel, PDF, Word, photo or email</div>
          <input type="file" multiple className="hidden" accept=".xlsx,.csv,.pdf,.docx,.jpg,.jpeg,.png,.webp,.eml,.txt" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
        </label>
        <textarea className="input min-h-[70px]" placeholder="…or paste the email text" value={body} onChange={(e) => setBody(e.target.value)} />
        {err && <div className="chip chip-bad !whitespace-normal">{err}</div>}
        <button
          className="btn-primary w-full h-9"
          disabled={busy || (!files.length && !body.trim())}
          onClick={async () => {
            setBusy(true);
            setErr(null);
            const fd = new FormData();
            fd.set("supplierId", supplier.id);
            fd.set("channel", "email");
            fd.set("body", body);
            files.forEach((f, i) => {
              fd.append("files", f);
              fd.append("kinds", i === 0 ? "quote" : "attachment");
            });
            const res = await fetch(`/api/rfx/${rfqId}/responses`, { method: "POST", body: fd });
            const j = await res.json();
            setBusy(false);
            if (!res.ok) return setErr(j.error);
            onDone();
          }}
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} Add and read
        </button>
      </div>
    </div>
  );
}
