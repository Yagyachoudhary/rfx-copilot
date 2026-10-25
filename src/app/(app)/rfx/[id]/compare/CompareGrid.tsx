"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowDownToLine, BadgeIndianRupee, Crown, FileSearch, Pencil, Repeat, X } from "lucide-react";
import type { Cell, Comparison } from "@/lib/compare";
import { inr, inrCompact } from "@/lib/compare";
import { cx, QualificationChip } from "@/components/ui";

type View = "unit" | "extended" | "raw";

export function CompareGrid({ rfqId, currency, cmp }: { rfqId: string; currency: string; cmp: Comparison }) {
  const sups = cmp.suppliers.filter((s) => s.response);
  const [view, setView] = useState<View>("unit");
  const [basket, setBasket] = useState<string[]>(sups.filter((s) => s.comparableCount > 0).map((s) => s.supplier.id));
  const [pop, setPop] = useState<{ cell: Cell; supplier: string; supplierId: string; responseId: string | null; line: any } | null>(null);

  const common = useMemo(() => cmp.lines.filter((l) => basket.length > 0 && basket.every((sid) => cmp.cells[l.id][sid]?.state === "comparable")), [cmp, basket]);
  const commonTotals = useMemo(
    () => Object.fromEntries(basket.map((sid) => [sid, common.reduce((a, l) => a + (cmp.cells[l.id][sid].extended ?? 0), 0)])),
    [basket, common, cmp],
  );
  const bestCommon = basket.length ? basket.reduce((a, b) => (commonTotals[a] <= commonTotals[b] ? a : b)) : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1">
          {(
            [
              ["unit", `Normalized unit price (${currency}, ex-GST)`],
              ["extended", "Extended (× RFQ qty)"],
              ["raw", "As quoted (raw)"],
            ] as [View, string][]
          ).map(([k, label]) => (
            <button key={k} className={view === k ? "btn-primary btn-sm" : "btn-secondary btn-sm"} onClick={() => setView(k)}>
              {label}
            </button>
          ))}
        </div>
        <a className="btn-secondary btn-sm" href={`/api/rfx/${rfqId}/export`}>
          <ArrowDownToLine className="w-3.5 h-3.5" /> Export XLSX (with sources)
        </a>
      </div>
      <div className="flex flex-wrap gap-3 text-[11.5px] text-ink-muted">
        <span className="inline-flex items-center gap-1"><Crown className="w-3 h-3 text-ok-strong" /> lowest comparable</span>
        <span className="inline-flex items-center gap-1"><span className="w-3 h-3 hatch border border-line inline-block" /> not quoted (never zero)</span>
        <span className="inline-flex items-center gap-1"><span className="w-3 h-3 inline-block rounded-sm" style={{ background: "rgb(var(--c-warning) / .25)" }} /> needs review — not comparable</span>
        <span className="inline-flex items-center gap-1"><Repeat className="w-3 h-3" /> currency converted</span>
        <span className="inline-flex items-center gap-1"><Pencil className="w-3 h-3" /> buyer correction</span>
        <span className="inline-flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-warn-strong" /> low confidence / outlier / tax assumed</span>
      </div>

      <div className="card overflow-auto max-h-[calc(100vh-260px)]">
        <table className="text-[12.5px] border-separate border-spacing-0 min-w-full">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-30 bg-surface border-b border-r border-line px-2 py-2 text-left min-w-[280px] align-bottom">
                <div className="text-[11px] uppercase tracking-wide text-ink-muted font-semibold">RFQ line</div>
              </th>
              {sups.map((s) => (
                <th key={s.supplier.id} className="sticky top-0 z-20 bg-surface border-b border-line px-2 py-2 text-left min-w-[170px] align-top font-normal">
                  <Link href={`/rfx/${rfqId}/responses/${s.response!.id}`} className="font-semibold text-[13px] hover:text-accent block leading-tight">{s.supplier.name}</Link>
                  <div className="text-[11px] text-ink-muted">v{s.response!.version} · {s.terms.currency ?? "?"}</div>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <div className="h-1.5 w-16 bg-surface-muted rounded-full overflow-hidden" title={`${s.comparableCount} comparable, ${s.reviewCount} need review, ${s.missingLines.length} missing`}>
                      <div className="h-full bg-ok" style={{ width: `${(s.comparableCount / cmp.lines.length) * 100}%` }} />
                    </div>
                    <span className={cx("num text-[11px] font-semibold", s.coverage < cmp.lines.length && "text-warn-strong")}>{s.coverage}/{cmp.lines.length}</span>
                  </div>
                  <div className="text-[11px] text-ink-muted num">{s.comparableCount} comparable · {s.reviewCount} review · {s.missingLines.length} missing</div>
                  <div className="mt-1"><QualificationChip status={s.qualification.status} label={s.qualification.label} /></div>
                  {(s.openExceptions.critical > 0 || s.openExceptions.warning > 0) && (
                    <div className="mt-1 flex gap-1">
                      {s.openExceptions.critical > 0 && <span className="chip chip-bad">{s.openExceptions.critical} critical</span>}
                      {s.openExceptions.warning > 0 && <span className="chip chip-warn">{s.openExceptions.warning} warn</span>}
                    </div>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cmp.lines.map((l) => {
              const best = cmp.bestByLine[l.id];
              return (
                <tr key={l.id} className="group">
                  <td className="sticky left-0 z-10 bg-surface border-b border-r border-line px-2 py-1.5 group-hover:bg-surface-muted/40">
                    <div className="flex gap-2">
                      <span className="num text-ink-muted w-7 shrink-0">L{l.line_no}</span>
                      <div className="min-w-0">
                        <div className="font-medium leading-tight">{l.description}</div>
                        <div className="text-[11px] text-ink-muted num">{Number(l.quantity).toLocaleString("en-IN")} {l.uom}</div>
                      </div>
                    </div>
                  </td>
                  {sups.map((s) => {
                    const c = cmp.cells[l.id][s.supplier.id];
                    const isBest = best?.supplierId === s.supplier.id && c.state === "comparable";
                    return (
                      <td
                        key={s.supplier.id}
                        className={cx(
                          "border-b border-line px-2 py-1.5 cursor-pointer align-top",
                          c.state === "missing" && "hatch",
                          c.state === "needs_review" && "bg-warn/10",
                          c.state === "conflict" && "bg-bad/10",
                          isBest && "shadow-[inset_0_0_0_2px_rgb(var(--c-success)/0.7)]",
                        )}
                        onClick={() => setPop({ cell: c, supplier: s.supplier.name, supplierId: s.supplier.id, responseId: s.response?.id ?? null, line: l })}
                      >
                        <CellView c={c} view={view} isBest={isBest} />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td className="sticky left-0 bottom-0 z-20 bg-surface-muted border-t border-r border-line px-2 py-2 font-semibold">
                Comparable subtotal
                <div className="text-[11px] font-normal text-ink-muted">Each supplier&apos;s own comparable lines only — different line sets, NOT comparable across suppliers</div>
              </td>
              {sups.map((s) => (
                <td key={s.supplier.id} className="sticky bottom-0 z-10 bg-surface-muted border-t border-line px-2 py-2 num">
                  <div className="font-semibold">{inrCompact(s.comparableTotal)}</div>
                  <div className="text-[11px] text-ink-muted">{s.comparableCount} of {cmp.lines.length} lines</div>
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      <section className="card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold flex items-center gap-1.5"><BadgeIndianRupee className="w-4 h-4" /> Common-basket comparison</h3>
            <p className="text-[12px] text-ink-muted max-w-2xl">Totals over lines that every selected supplier priced comparably — the only like-for-like total. Change the selection to widen or narrow the basket.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {sups.map((s) => (
              <label key={s.supplier.id} className="flex items-center gap-1 text-[12px] border border-line rounded px-2 py-1">
                <input type="checkbox" checked={basket.includes(s.supplier.id)} onChange={(e) => setBasket(e.target.checked ? [...basket, s.supplier.id] : basket.filter((x) => x !== s.supplier.id))} />
                {s.supplier.name}
              </label>
            ))}
          </div>
        </div>
        <div className="mt-3 text-[13px]">
          {common.length === 0 ? (
            <span className="chip chip-warn">No line is comparable across all selected suppliers — deselect suppliers with low coverage.</span>
          ) : (
            <>
              <div className="text-ink-muted text-[12px] mb-2">
                Basket: {common.length} lines ({common.map((l) => `L${l.line_no}`).join(", ")})
              </div>
              <div className="flex flex-wrap gap-3">
                {basket.map((sid) => {
                  const s = sups.find((x) => x.supplier.id === sid)!;
                  return (
                    <div key={sid} className={cx("rounded-md border px-3 py-2", sid === bestCommon ? "border-ok bg-ok/10" : "border-line")}>
                      <div className="text-[12px] font-semibold">{s.supplier.name}</div>
                      <div className="text-[16px] font-bold num">{inr(commonTotals[sid], 0)}</div>
                      {sid === bestCommon && <div className="text-[11px] text-ok-strong font-semibold">lowest on this basket</div>}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </section>

      {pop && <CellPopover pop={pop} rfqId={rfqId} onClose={() => setPop(null)} />}
    </div>
  );
}

function CellView({ c, view, isBest }: { c: Cell; view: View; isBest: boolean }) {
  if (c.state === "no_response") return <span className="text-ink-muted">no response</span>;
  if (c.state === "missing") return <span className="text-ink-muted text-[11px] font-semibold uppercase">Not quoted</span>;
  const icons = (
    <span className="inline-flex gap-0.5 ml-1 align-middle">
      {c.fx && <Repeat className="w-3 h-3 text-ink-muted" aria-label="converted" />}
      {c.hasOverride && <Pencil className="w-3 h-3 text-brand-mid" aria-label="buyer correction" />}
      {(c.flags.includes("low_confidence") || c.flags.includes("outlier") || c.flags.includes("tax_assumed")) && <AlertTriangle className="w-3 h-3 text-warn-strong" aria-label="flag" />}
    </span>
  );
  const raw = c.raw ? `${c.raw.currency ?? ""} ${c.raw.price ?? "—"}${c.raw.basis === "per_n_units" ? ` /${c.raw.basisQty}` : c.raw.basis === "per_pack" ? ` /pack${c.raw.basisQty ? ` of ${c.raw.basisQty}` : ""}` : c.raw.basis === "per_kg" ? " /kg" : ""}` : "—";
  if (c.state === "conflict") return <div><span className="text-bad-strong text-[11px] font-semibold uppercase">Conflict</span><div className="text-[11px]">{c.reason}</div></div>;
  if (c.state === "needs_review")
    return (
      <div>
        <div className="text-warn-strong text-[11px] font-semibold uppercase">Review</div>
        <div className="text-[11px] num">{raw}</div>
        <div className="text-[10.5px] text-ink-muted leading-tight line-clamp-2">{c.reason}</div>
      </div>
    );
  return (
    <div className="num">
      <span className={cx("font-semibold", isBest && "text-ok-strong")}>
        {isBest && <Crown className="w-3 h-3 inline mr-0.5 -mt-0.5" />}
        {view === "unit" ? inr(c.unitPrice) : view === "extended" ? inrCompact(c.extended) : raw}
      </span>
      {icons}
      {view !== "raw" && c.raw && (c.raw.currency !== "INR" || c.raw.basis !== "per_unit") && <div className="text-[10.5px] text-ink-muted">{raw}</div>}
    </div>
  );
}

function CellPopover({ pop, rfqId, onClose }: { pop: any; rfqId: string; onClose: () => void }) {
  const c: Cell = pop.cell;
  return (
    <div className="fixed inset-0 z-50 bg-black/30 grid place-items-center p-4" onClick={onClose}>
      <div className="card w-full max-w-lg p-5 space-y-3 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-start">
          <div>
            <div className="text-[12px] text-ink-muted">{pop.supplier}</div>
            <div className="font-bold">L{pop.line.line_no} · {pop.line.description}</div>
          </div>
          <button className="btn-ghost btn-sm" onClick={onClose} aria-label="Close"><X className="w-4 h-4" /></button>
        </div>
        <div className="grid grid-cols-3 gap-2 text-[12.5px]">
          <div className="rounded border border-line p-2">
            <div className="text-[10.5px] uppercase text-ink-muted font-semibold">Quoted</div>
            <div className="num font-semibold">{c.raw ? `${c.raw.currency ?? ""} ${c.raw.price ?? "—"}` : "—"}</div>
            <div className="text-[11px] text-ink-muted">{c.raw?.basis}{c.raw?.basisQty ? ` (${c.raw.basisQty})` : ""}</div>
          </div>
          <div className="rounded border border-line p-2">
            <div className="text-[10.5px] uppercase text-ink-muted font-semibold">Normalized</div>
            <div className="num font-semibold">{inr(c.unitPrice)}</div>
            <div className="text-[11px] text-ink-muted">per {pop.line.uom}, ex-GST</div>
          </div>
          <div className="rounded border border-line p-2">
            <div className="text-[10.5px] uppercase text-ink-muted font-semibold">Evaluated (× qty)</div>
            <div className="num font-semibold">{inr(c.extended, 0)}</div>
          </div>
        </div>
        {c.reason && <div className="chip chip-warn !whitespace-normal !rounded-md">{c.reason}</div>}
        {c.rules.length > 0 && (
          <div>
            <div className="label">How it was normalized</div>
            <ul className="text-[12.5px] list-disc pl-5">{c.rules.map((r, i) => <li key={i}>{r}</li>)}</ul>
          </div>
        )}
        {c.fx && <div className="text-[12px]">FX: 1 {c.fx.currency} = {c.fx.rate} INR · as of {c.fx.asOf} · {c.fx.source}</div>}
        {c.flags.length > 0 && <div className="flex gap-1 flex-wrap">{c.flags.map((f) => <span key={f} className="chip chip-warn">{f.replace("_", " ")}</span>)}</div>}
        <div>
          <div className="label">Source</div>
          {c.source?.snippet ? <blockquote className="border-l-4 border-accent bg-accent/5 px-3 py-1.5 text-[12.5px]">{c.source.snippet}</blockquote> : <div className="text-[12px] text-ink-muted">{c.state === "missing" ? "Not present in the supplier's response." : "Source not available."}</div>}
          {c.source?.ref && <div className="text-[11px] text-ink-muted mt-1">{c.source.ref}</div>}
        </div>
        {pop.responseId && (
          <Link href={`/rfx/${rfqId}/responses/${pop.responseId}`} className="btn-secondary btn-sm">
            <FileSearch className="w-3.5 h-3.5" /> Open in extraction review
          </Link>
        )}
      </div>
    </div>
  );
}
