"use client";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDownToLine, ChevronDown, Code2, Database, Loader2, Send, Trash2 } from "lucide-react";
import { Empty } from "@/components/ui";

const SUGGESTIONS = [
  "Which supplier has the lowest comparable cost for the lines quoted by all suppliers? Show the calculation and exclusions.",
  "Which suppliers quoted fewer than 30 lines, and which items are missing?",
  "What if we split it — cheapest per line, but only among vendors who cleared the quality questionnaire?",
  "Normalize the unit prices where pack-size information is available. Which rows still need human review?",
  "Compare the lowest-cost supplier with the best questionnaire response. What are the trade-offs?",
  "What changes if freight is included in evaluated cost? Show the assumptions and affected suppliers.",
  "List every value in the comparison that has low confidence or lacks source evidence.",
  "Create an exportable comparison table with raw quote, normalized unit price, currency, coverage, and source reference.",
];

type Msg = { id?: string; role: "user" | "assistant"; content: string; artifacts: any[]; pending?: boolean; status?: string };

export function AnalystChat({ rfqId, initial, hasData }: { rfqId: string; initial: any[]; hasData: boolean }) {
  const [msgs, setMsgs] = useState<Msg[]>(initial.map((m) => ({ ...m, artifacts: m.artifacts ?? [] })));
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => bottom.current?.scrollIntoView({ behavior: "smooth" }), [msgs]);

  async function ask(question: string) {
    if (!question.trim() || busy) return;
    setBusy(true);
    setQ("");
    setMsgs((m) => [...m, { role: "user", content: question, artifacts: [] }, { role: "assistant", content: "", artifacts: [], pending: true, status: "Starting…" }]);
    const update = (fn: (m: Msg) => Msg) => setMsgs((all) => all.map((m, i) => (i === all.length - 1 ? fn(m) : m)));
    try {
      const res = await fetch(`/api/rfx/${rfqId}/analyst`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question }) });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
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
          else if (e.type === "sql" || e.type === "chart" || e.type === "export") update((m) => ({ ...m, artifacts: [...m.artifacts, e], status: e.type === "sql" ? `Ran: ${e.purpose}` : m.status }));
          else if (e.type === "text") update((m) => ({ ...m, content: e.text }));
          else if (e.type === "error") update((m) => ({ ...m, content: e.text }));
          else if (e.type === "done") update((m) => ({ ...m, pending: false }));
        }
      }
    } catch (e: any) {
      update((m) => ({ ...m, pending: false, content: `Error: ${e.message}` }));
    } finally {
      setBusy(false);
      update((m) => ({ ...m, pending: false }));
    }
  }

  return (
    <div className="grid lg:grid-cols-[1fr_300px] gap-4">
      <div className="card flex flex-col h-[calc(100vh-230px)] min-h-[520px]">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-line">
          <div className="text-[12px] text-ink-muted flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5" /> Answers are computed with SQL over the current reviewed data (active versions, buyer corrections applied). Every query is shown.
          </div>
          {msgs.length > 0 && (
            <button
              className="btn-ghost btn-sm"
              onClick={async () => {
                await fetch(`/api/rfx/${rfqId}/analyst`, { method: "DELETE" });
                setMsgs([]);
              }}
            >
              <Trash2 className="w-3.5 h-3.5" /> Clear
            </button>
          )}
        </div>
        <div className="flex-1 overflow-auto px-4 py-4 space-y-5">
          {msgs.length === 0 && (
            <Empty
              title="Ask anything about this event"
              body={hasData ? "Try one of the suggested questions — or ask the VP's question in your own words." : "No processed responses yet. Receive and process responses first; the analyst only works on extracted data."}
            />
          )}
          {msgs.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[80%] bg-primary text-primary-fg rounded-2xl rounded-br-sm px-4 py-2 text-[13.5px]">{m.content}</div>
              </div>
            ) : (
              <div key={i} className="space-y-2">
                {m.artifacts.map((a: any, j: number) => <Artifact key={j} a={a} />)}
                {m.pending && (
                  <div className="flex items-center gap-2 text-[12.5px] text-ink-muted">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> {m.status}
                  </div>
                )}
                {m.content && (
                  <div className="markdown text-[13.5px] leading-relaxed">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                  </div>
                )}
              </div>
            ),
          )}
          <div ref={bottom} />
        </div>
        <form
          className="border-t border-line p-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            ask(q);
          }}
        >
          <input className="input h-10" placeholder="e.g. What if we split it, cheapest per line, only among qualified vendors?" value={q} onChange={(e) => setQ(e.target.value)} disabled={busy} />
          <button className="btn-primary h-10" disabled={busy || !q.trim()}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </form>
      </div>
      <aside className="space-y-2">
        <div className="text-[11px] uppercase tracking-wide font-semibold text-ink-muted">Suggested questions</div>
        {SUGGESTIONS.map((s) => (
          <button key={s} className="card text-left text-[12.5px] px-3 py-2 w-full hover:border-accent disabled:opacity-50" disabled={busy || !hasData} onClick={() => ask(s)}>
            {s}
          </button>
        ))}
      </aside>
    </div>
  );
}

function Artifact({ a }: { a: any }) {
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
