"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { AlertTriangle, ArrowDownToLine, Pencil, Repeat, ShieldCheck, ShieldQuestion, ShieldX, X } from "lucide-react";
import type { Cell, Comparison } from "@/lib/compare";
import { inr, inrCompact } from "@/lib/compare";
import { MarkCompared } from "@/components/GettingStarted";

type View = "unit" | "total";

function QualIcon({ status, label }: { status: string; label: string }) {
  if (status === "qualified_verified") return <ShieldCheck className="w-4 h-4 text-ok-strong" aria-label={label} />;
  if (status === "qualified_claimed") return <ShieldQuestion className="w-4 h-4 text-accent" aria-label={label} />;
  return <ShieldX className={clsx("w-4 h-4", status === "not_qualified" ? "text-bad-strong" : "text-warn-strong")} aria-label={label} />;
}

const short = (n: string) => n.replace(/\b(Pvt|Pte|Ltd|Industries|Solutions|Products|Corrugators|Packaging|Paper)\b\.?/g, "").replace(/\s+/g, " ").trim();

export function CompareGrid({ rfqId, cmp }: { rfqId: string; currency: string; cmp: Comparison }) {
  const sups = cmp.suppliers.filter((s) => s.response);
  const [view, setView] = useState<View>("unit");
  const [basket, setBasket] = useState<string[]>(sups.filter((s) => s.comparableCount >= cmp.lines.length * 0.5).map((s) => s.supplier.id));
  const [pick, setPick] = useState<{ c: Cell; s: (typeof sups)[number]; l: any } | null>(null);

  const common = useMemo(() => cmp.lines.filter((l) => basket.length > 0 && basket.every((sid) => cmp.cells[l.id][sid]?.state === "comparable")), [cmp, basket]);
  const totals = useMemo(
    () => basket.map((sid) => ({ sid, name: sups.find((x) => x.supplier.id === sid)!.supplier.name, total: common.reduce((a, l) => a + (cmp.cells[l.id][sid].extended ?? 0), 0) })).sort((a, b) => a.total - b.total),
    [basket, common, cmp, sups],
  );
  const max = Math.max(...totals.map((t) => t.total), 1);
  const wins = useMemo(() => Object.fromEntries(sups.map((s) => [s.supplier.id, cmp.lines.filter((l) => cmp.bestByLine[l.id]?.supplierId === s.supplier.id).length])), [cmp, sups]);

  return (
    <div className="space-y-4">
      <MarkCompared rfqId={rfqId} />
      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-bold text-[16px]">Like-for-like total</h2>
            <p className="text-[13px] text-ink-muted">{common.length ? `On the ${common.length} lines every selected supplier priced` : "Select suppliers that priced the same lines"}</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {sups.map((s) => {
              const on = basket.includes(s.supplier.id);
              return (
                <button
                  key={s.supplier.id}
                  onClick={() => setBasket(on ? basket.filter((x) => x !== s.supplier.id) : [...basket, s.supplier.id])}
                  className={clsx("chip", on ? "chip-brand" : "chip-muted opacity-70")}
                  title={`${s.comparableCount} comparable lines`}
                >
                  {on ? "✓ " : "+ "}{short(s.supplier.name)}
                </button>
              );
            })}
          </div>
        </div>
        {common.length > 0 && (
          <div className="mt-4 space-y-2">
            {totals.map((t, i) => (
              <div key={t.sid} className="grid grid-cols-[140px_1fr_120px] items-center gap-3 text-[13px]">
                <span className={clsx("truncate", i === 0 && "font-semibold")}>{short(t.name)}</span>
                <div className="h-6 bg-surface-muted/60 rounded">
                  <div className={clsx("h-full rounded", i === 0 ? "bg-ok" : "bg-primary/35")} style={{ width: `${(t.total / max) * 100}%` }} />
                </div>
                <span className={clsx("num text-right", i === 0 && "font-bold text-ok-strong")}>
                  {inrCompact(t.total)}
                  {i > 0 && <span className="block text-[11px] text-ink-muted font-normal">+{(((t.total - totals[0].total) / totals[0].total) * 100).toFixed(1)}%</span>}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-line">
          <div className="flex rounded-md border border-line overflow-hidden text-[12.5px]">
            {(
              [
                ["unit", "Price per unit"],
                ["total", "Line total"],
              ] as [View, string][]
            ).map(([k, label]) => (
              <button key={k} onClick={() => setView(k)} className={clsx("px-3 py-1.5", view === k ? "bg-primary text-primary-fg font-semibold" : "hover:bg-surface-muted/60")}>{label}</button>
            ))}
          </div>
          <div className="flex items-center gap-4 text-[12px] text-ink-muted">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm heat-1 border border-ok/40" /> Lowest</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-warn/30" /> Needs a decision</span>
            <span className="flex items-center gap-1.5"><span className="text-ink-muted">—</span> Not quoted</span>
            <a className="btn-secondary btn-sm" href={`/api/rfx/${rfqId}/export`}><ArrowDownToLine className="w-3.5 h-3.5" /> Excel</a>
          </div>
        </div>
        <div className="overflow-auto max-h-[calc(100vh-200px)]">
          <table className="text-[13px] border-separate border-spacing-0 min-w-full">
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-30 bg-surface border-b border-r border-line px-3 py-2 text-left font-medium text-ink-muted min-w-[270px]">Line · qty</th>
                {sups.map((s) => (
                  <th key={s.supplier.id} className="sticky top-0 z-20 bg-surface border-b border-line px-3 py-2 text-right font-normal min-w-[130px] align-bottom">
                    <Link href={`/rfx/${rfqId}/responses/${s.response!.id}`} className="font-semibold text-[13px] hover:text-accent flex items-center justify-end gap-1.5" title={s.qualification.label}>
                      <QualIcon status={s.qualification.status} label={s.qualification.label} />
                      <span className="truncate max-w-[110px]">{short(s.supplier.name)}</span>
                    </Link>
                    <div className="text-[11.5px] text-ink-muted num">{s.coverage}/{cmp.lines.length} quoted · {wins[s.supplier.id]} lowest</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cmp.lines.map((l) => {
                const best = cmp.bestByLine[l.id];
                return (
                  <tr key={l.id} className="group">
                    <td className="sticky left-0 z-10 bg-surface border-b border-r border-line px-3 py-1.5 group-hover:bg-surface-muted">
                      <div className="flex gap-2 items-baseline">
                        <span className="num text-ink-muted w-7 shrink-0 text-[12px]">L{l.line_no}</span>
                        <span className="truncate max-w-[220px]" title={`${l.description} — ${l.specification ?? ""}`}>{l.description}</span>
                      </div>
                      <div className="pl-9 text-[11.5px] text-ink-muted num">{Number(l.quantity).toLocaleString("en-IN")} {l.uom}</div>
                    </td>
                    {sups.map((s) => {
                      const c = cmp.cells[l.id][s.supplier.id];
                      const isBest = best?.supplierId === s.supplier.id && c.state === "comparable";
                      return (
                        <td
                          key={s.supplier.id}
                          onClick={() => c.state !== "missing" && setPick({ c, s, l })}
                          className={clsx(
                            "border-b border-line px-3 py-1.5 text-right num align-middle",
                            c.state !== "missing" && "cursor-pointer hover:outline hover:outline-1 hover:outline-accent/50 hover:-outline-offset-1",
                            isBest && "heat-1",
                            (c.state === "needs_review" || c.state === "conflict" || c.flags.includes("outlier")) && "bg-warn/15",
                          )}
                        >
                          {c.state === "missing" || c.state === "no_response" ? (
                            <span className="text-ink-muted/60">—</span>
                          ) : c.state === "comparable" ? (
                            <span className={clsx("inline-flex items-center gap-1", isBest && "font-bold text-ok-strong")}>
                              {c.fx && <Repeat className="w-3 h-3 text-ink-muted" aria-label={`converted from ${c.fx.currency}`} />}
                              {c.hasOverride && <Pencil className="w-3 h-3 text-brand-mid" aria-label="edited by buyer" />}
                              {(c.flags.includes("outlier") || c.flags.includes("low_confidence")) && <AlertTriangle className="w-3 h-3 text-warn-strong" aria-label={c.flags.includes("outlier") ? "far from other suppliers — possible typo" : "low confidence"} />}
                              {view === "unit" ? inr(c.unitPrice) : inrCompact(c.extended)}
                            </span>
                          ) : (
                            <span className="text-warn-strong text-[12px] font-semibold">{c.state === "conflict" ? "2 prices" : "decide"}</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {pick && <CellPanel rfqId={rfqId} {...pick} onClose={() => setPick(null)} />}
    </div>
  );
}

function CellPanel({ rfqId, c, s, l, onClose }: { rfqId: string; c: Cell; s: any; l: any; onClose: () => void }) {
  const raw = c.raw ? `${c.raw.currency === "USD" ? "$" : "₹"}${c.raw.price ?? "—"}${c.raw.basis === "per_n_units" ? ` per ${c.raw.basisQty}` : c.raw.basis === "per_pack" ? ` per pack${c.raw.basisQty ? ` of ${c.raw.basisQty}` : ""}` : c.raw.basis === "per_kg" ? " per kg" : ""}` : "—";
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20" onClick={onClose}>
      <aside className="w-full sm:w-[400px] h-full bg-surface shadow-2xl p-5 space-y-4 overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-[12.5px] text-ink-muted">{s.supplier.name}</div>
            <div className="font-bold">L{l.line_no} · {l.description}</div>
          </div>
          <button className="btn-ghost btn-sm" onClick={onClose} aria-label="Close"><X className="w-4 h-4" /></button>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg border border-line p-2.5">
            <div className="text-[11.5px] text-ink-muted">Quoted</div>
            <div className="num font-semibold text-[13px]">{raw}</div>
          </div>
          <div className="rounded-lg border border-line p-2.5">
            <div className="text-[11.5px] text-ink-muted">Per {l.uom}</div>
            <div className="num font-semibold">{inr(c.unitPrice)}</div>
          </div>
          <div className="rounded-lg border border-line p-2.5">
            <div className="text-[11.5px] text-ink-muted">× {Number(l.quantity).toLocaleString("en-IN")}</div>
            <div className="num font-semibold">{inrCompact(c.extended)}</div>
          </div>
        </div>
        {c.reason && <div className="rounded-md bg-warn/15 px-3 py-2 text-[13px]">{c.reason}</div>}
        {c.rules.length > 0 && (
          <ul className="space-y-1 text-[13px]">
            {c.rules.map((r, i) => (
              <li key={i} className="flex gap-2"><span className="text-ok-strong">✓</span> {r}</li>
            ))}
          </ul>
        )}
        {c.source?.snippet && (
          <figure>
            <blockquote className="border-l-4 border-accent bg-accent/5 px-3 py-2 text-[13px]">{c.source.snippet}</blockquote>
            {c.source.ref && <figcaption className="text-[12px] text-ink-muted mt-1">{c.source.ref}</figcaption>}
          </figure>
        )}
        <Link href={`/rfx/${rfqId}/responses/${s.response.id}`} className="btn-secondary w-full">Open {s.supplier.name.split(" ")[0]}&apos;s reply</Link>
      </aside>
    </div>
  );
}
