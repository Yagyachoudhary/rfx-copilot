"use client";
import { readJson } from "@/lib/read-json";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDownToLine, ChevronDown, Code2, Loader2, Send, Trash2 } from "lucide-react";
import clsx from "clsx";

export type Msg = { role: "user" | "assistant"; content: string; artifacts: any[]; pending?: boolean; status?: string };

/** Streams answers from the grounded analyst (SQL over the current reviewed data). */
export function useCopilot(rfqId: string | null) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setMsgs([]);
    setLoaded(false);
    if (!rfqId) return;
    fetch(`/api/rfx/${rfqId}/analyst`)
      .then((r) => r.json())
      .then((j) => setMsgs((prev) => (prev.length ? prev : (j.messages ?? []).map((m: any) => ({ ...m, artifacts: m.artifacts ?? [] })))))
      .finally(() => setLoaded(true));
  }, [rfqId]);

  async function ask(question: string) {
    if (!rfqId || !question.trim() || busy) return;
    setBusy(true);
    setMsgs((m) => [...m, { role: "user", content: question, artifacts: [] }, { role: "assistant", content: "", artifacts: [], pending: true, status: "Reading your event data…" }]);
    const update = (fn: (m: Msg) => Msg) => setMsgs((all) => all.map((m, i) => (i === all.length - 1 ? fn(m) : m)));
    try {
      const res = await fetch(`/api/rfx/${rfqId}/analyst`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question }) });
      if (!res.ok || !res.body) {
        const j = await readJson(res).catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const e = JSON.parse(line);
          if (e.type === "status") update((m) => ({ ...m, status: e.text }));
          else if (e.type === "sql" || e.type === "chart" || e.type === "export") update((m) => ({ ...m, artifacts: [...m.artifacts, e], status: e.type === "sql" ? e.purpose : m.status }));
          else if (e.type === "text" || e.type === "error") update((m) => ({ ...m, content: e.text }));
          else if (e.type === "done") update((m) => ({ ...m, pending: false }));
        }
      }
    } catch (e: any) {
      update((m) => ({ ...m, pending: false, content: `Something went wrong: ${e.message}` }));
    } finally {
      setBusy(false);
      update((m) => ({ ...m, pending: false }));
    }
  }
  async function clear() {
    if (!rfqId) return;
    await fetch(`/api/rfx/${rfqId}/analyst`, { method: "DELETE" });
    setMsgs([]);
  }
  return { msgs, busy, ask, clear, loaded };
}

export function Conversation({ msgs, compact }: { msgs: Msg[]; compact?: boolean }) {
  const bottom = useRef<HTMLDivElement>(null);
  // Braces matter: newer browsers return a Promise from scrollIntoView, and React must not get it back as a cleanup.
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);
  return (
    <div className={clsx("space-y-4", compact ? "text-[13px]" : "text-[13.5px]")}>
      {msgs.map((m, i) =>
        m.role === "user" ? (
          <div key={i} className="flex justify-end">
            <div className="max-w-[85%] bg-primary text-primary-fg rounded-2xl rounded-br-sm px-3.5 py-2">{m.content}</div>
          </div>
        ) : (
          <div key={i} className="space-y-2">
            {m.artifacts.map((a: any, j: number) => <Artifact key={j} a={a} />)}
            {m.pending && (
              <div className="flex items-center gap-2 text-ink-muted"><Loader2 className="w-3.5 h-3.5 animate-spin" /> {m.status}</div>
            )}
            {m.content && (
              <div className="markdown leading-relaxed overflow-x-auto">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
              </div>
            )}
          </div>
        ),
      )}
      <div ref={bottom} />
    </div>
  );
}

export function AskBox({ onAsk, busy, placeholder }: { onAsk: (q: string) => void; busy: boolean; placeholder: string }) {
  const [q, setQ] = useState("");
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim()) {
          onAsk(q.trim());
          setQ("");
        }
      }}
    >
      <input className="input h-10" placeholder={placeholder} value={q} onChange={(e) => setQ(e.target.value)} disabled={busy} />
      <button className="btn-primary h-10 px-3" disabled={busy || !q.trim()} aria-label="Send">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}</button>
    </form>
  );
}

export { Trash2 };

export function Artifact({ a }: { a: any }) {
  const [open, setOpen] = useState(false);
  if (a.type === "sql")
    return (
      <div className="rounded-md border border-line bg-surface-muted/30 text-[12px]">
        <button className="w-full flex items-center gap-2 px-3 py-1.5 text-left" onClick={() => setOpen(!open)}>
          <Code2 className="w-3.5 h-3.5 text-accent shrink-0" />
          <span className="flex-1 truncate">{a.purpose || "Query"}</span>
          {a.error ? <span className="chip chip-bad">error</span> : <span className="text-ink-muted num">{a.rows.length}{a.truncated ? "+" : ""} rows</span>}
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        {open && (
          <div className="px-3 pb-3 space-y-2">
            <pre className="bg-surface border border-line rounded p-2 overflow-auto text-[11.5px] whitespace-pre-wrap">{a.query}</pre>
            {a.error ? (
              <div className="text-bad-strong">{a.error}</div>
            ) : (
              <div className="overflow-auto max-h-64 border border-line rounded bg-surface">
                <table className="text-[11.5px] w-full">
                  <thead>
                    <tr>{a.columns.map((c: string) => <th key={c} className="text-left px-2 py-1 border-b border-line bg-surface-muted/50 sticky top-0">{c}</th>)}</tr>
                  </thead>
                  <tbody>
                    {a.rows.map((r: any[], i: number) => (
                      <tr key={i}>{r.map((v, j) => <td key={j} className="px-2 py-0.5 border-b border-line num whitespace-nowrap max-w-[260px] truncate" title={String(v ?? "")}>{v === null ? <span className="text-ink-muted">NULL</span> : String(v)}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    );
  if (a.type === "chart") {
    const colors = ["rgb(var(--c-brand-mid))", "rgb(var(--c-accent))", "rgb(var(--c-success))", "rgb(var(--c-warning))"];
    const C = a.chartType === "line" ? LineChart : BarChart;
    return (
      <div className="card p-3">
        <div className="font-semibold text-[13px] mb-2">{a.title}</div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <C data={a.data} margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--c-border))" />
              <XAxis dataKey={a.x} tick={{ fontSize: 11 }} interval={0} angle={a.data.length > 6 ? -20 : 0} textAnchor={a.data.length > 6 ? "end" : "middle"} height={a.data.length > 6 ? 60 : 30} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => (Math.abs(v) >= 1e5 ? `${(v / 1e5).toFixed(1)}L` : String(v))} label={a.yLabel ? { value: a.yLabel, angle: -90, position: "insideLeft", fontSize: 11 } : undefined} />
              <Tooltip formatter={(v: any) => (typeof v === "number" ? v.toLocaleString("en-IN") : v)} />
              {a.y.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
              {a.y.map((y: string, i: number) =>
                a.chartType === "line" ? <Line key={y} dataKey={y} stroke={colors[i % 4]} strokeWidth={2} dot={false} /> : <Bar key={y} dataKey={y} fill={colors[i % 4]} radius={[3, 3, 0, 0]} />,
              )}
            </C>
          </ResponsiveContainer>
        </div>
        <details className="text-[11px] text-ink-muted mt-1">
          <summary className="cursor-pointer">data query</summary>
          <pre className="whitespace-pre-wrap">{a.query}</pre>
        </details>
      </div>
    );
  }
  if (a.type === "export")
    return (
      <a href={a.url} className="inline-flex items-center gap-2 card px-3 py-2 text-[13px] hover:border-accent">
        <ArrowDownToLine className="w-4 h-4 text-accent" /> <span className="font-semibold">{a.fileName}</span> <span className="text-ink-muted">{a.rows} rows</span>
      </a>
    );
  return null;
}
