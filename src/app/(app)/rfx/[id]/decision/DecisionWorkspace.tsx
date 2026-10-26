"use client";
import { readJson } from "@/lib/read-json";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { AlertTriangle, ArrowDownToLine, CheckCircle2, ChevronDown, Loader2, Wand2 } from "lucide-react";
import { computeScenario, inr, inrCompact, type Comparison, type ScenarioOptions, type ScenarioResult } from "@/lib/compare";
import { fmtDateTime } from "@/components/ui";

const base: ScenarioOptions = { mode: "split_cheapest", onlyQualified: false, requireVerified: false, includeFreight: true, applyConditionalDiscounts: false, excludeFlagged: true };
const COLORS = ["rgb(var(--c-brand-mid))", "rgb(var(--c-accent))", "rgb(var(--c-success))", "rgb(var(--c-warning))", "rgb(var(--c-brand-end))"];
const short = (n: string) => n.replace(/\b(Pvt|Pte|Ltd|Industries|Solutions|Products|Corrugators|Packaging|Paper)\b\.?/g, "").replace(/\s+/g, " ").trim();

function Split({ r, colorOf }: { r: ScenarioResult; colorOf: (id: string) => string }) {
  const sum = r.bySupplier.reduce((a, b) => a + b.subtotal, 0) || 1;
  return (
    <div className="flex h-2 rounded-full overflow-hidden bg-surface-muted">
      {r.bySupplier.map((b) => (
        <div key={b.supplierId} style={{ width: `${(b.subtotal / sum) * 100}%`, background: colorOf(b.supplierId) }} title={`${b.supplierName}: ${inrCompact(b.subtotal)}`} />
      ))}
    </div>
  );
}

function Toggle({ label, v, on }: { label: string; v: boolean; on: (v: boolean) => void }) {
  return (
    <button onClick={() => on(!v)} className={clsx("chip !py-1 !px-2.5 !text-[12.5px]", v ? "chip-brand" : "chip-muted")} aria-pressed={v}>
      {v ? "✓ " : ""}{label}
    </button>
  );
}

export function DecisionWorkspace({ rfqId, rfq, cmp, openExceptions, decisions }: { rfqId: string; rfq: any; cmp: Comparison; openExceptions: any[]; decisions: any[] }) {
  const router = useRouter();
  const responding = cmp.suppliers.filter((s) => s.response);
  const colorOf = (id: string) => COLORS[Math.max(0, responding.findIndex((s) => s.supplier.id === id)) % COLORS.length];
  const [opts, setOpts] = useState<ScenarioOptions>({ ...base, onlyQualified: true });
  const [rationale, setRationale] = useState("");
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [lines, setLines] = useState(false);

  const presets = useMemo(() => {
    const list: { label: string; o: ScenarioOptions }[] = [
      { label: "Cheapest per line · qualified suppliers", o: { ...base, onlyQualified: true } },
      { label: "Cheapest per line · everyone", o: { ...base } },
    ];
    for (const s of responding.filter((s) => s.comparableCount >= cmp.lines.length * 0.6)) list.push({ label: `All to ${short(s.supplier.name)}`, o: { ...base, mode: "single_supplier", supplierId: s.supplier.id } });
    return list.map((p) => ({ ...p, r: computeScenario(cmp, p.o, rfq.currency) }));
  }, [cmp, responding, rfq.currency]);
  const r = useMemo(() => computeScenario(cmp, opts, rfq.currency), [cmp, opts, rfq.currency]);
  const affected = openExceptions.filter((e) => r.bySupplier.some((b) => b.supplierId === e.supplierId));
  const critical = affected.filter((e) => e.severity === "critical");
  const exportHref = `/api/rfx/${rfqId}/export?mode=${opts.mode}${opts.supplierId ? `&supplierId=${opts.supplierId}` : ""}&q=${opts.onlyQualified ? 1 : 0}&v=${opts.requireVerified ? 1 : 0}&f=${opts.includeFreight ? 1 : 0}&d=${opts.applyConditionalDiscounts ? 1 : 0}&x=${opts.excludeFlagged ? 1 : 0}`;
  const confirmed = decisions.find((d) => d.status === "buyer_confirmed");

  async function save(status: "draft" | "buyer_confirmed") {
    setBusy(status);
    setErr(null);
    const res = await fetch(`/api/rfx/${rfqId}/decision`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ status, options: opts, scenario: r, rationale, acknowledgedExceptions: affected.map((a) => a.id) }) });
    const j = await readJson(res);
    setBusy(null);
    if (!res.ok) return setErr(j.error);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {presets.map((p) => {
          const active = JSON.stringify(p.o) === JSON.stringify(opts);
          return (
            <button key={p.label} onClick={() => setOpts(p.o)} className={clsx("card text-left p-4 space-y-2 transition-colors", active ? "border-primary ring-1 ring-primary" : "hover:border-accent/60")}>
              <div className="text-[12.5px] text-ink-muted">{p.label}</div>
              <div className="text-[22px] font-bold num leading-none">{inrCompact(p.r.total)}</div>
              <Split r={p.r} colorOf={colorOf} />
              <div className={clsx("text-[12px]", p.r.totalIsComplete ? "text-ink-muted" : "text-warn-strong font-semibold")}>
                {p.r.awards.length}/{cmp.lines.length} lines{p.r.totalIsComplete ? "" : ` · ${p.r.unpricedLines.length} unpriced`}
              </div>
            </button>
          );
        })}
      </div>

      <div className="grid xl:grid-cols-[1fr_400px] gap-4 items-start">
        <section className="card p-5 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-bold text-[16px] mr-auto">{r.title}</h2>
            <Toggle label="Qualified only" v={opts.onlyQualified} on={(v) => setOpts({ ...opts, onlyQualified: v })} />
            <Toggle label="Add freight" v={opts.includeFreight} on={(v) => setOpts({ ...opts, includeFreight: v })} />
            <Toggle label="Count conditional discounts" v={opts.applyConditionalDiscounts} on={(v) => setOpts({ ...opts, applyConditionalDiscounts: v })} />
            <Toggle label="Skip doubtful prices" v={opts.excludeFlagged} on={(v) => setOpts({ ...opts, excludeFlagged: v })} />
          </div>

          <div className="flex flex-wrap items-end gap-6">
            <div>
              <div className="text-[12.5px] text-ink-muted">Evaluated total</div>
              <div className="text-[30px] font-extrabold num leading-tight">{inr(r.total, 0)}</div>
            </div>
            <div className="text-[13px] text-ink-muted num pb-1.5">
              {inrCompact(r.subtotal)} goods{r.freightTotal ? ` + ${inrCompact(r.freightTotal)} freight` : ""}{r.discountTotal ? ` − ${inrCompact(r.discountTotal)} discount` : ""}
            </div>
            {!r.totalIsComplete && (
              <span className="chip chip-warn mb-1.5" title={r.unpricedLines.map((u) => `L${u.lineNo}: ${u.why}`).join("\n")}>
                <AlertTriangle className="w-3 h-3" /> Incomplete: {r.unpricedLines.length ? `${r.unpricedLines.length} lines unpriced` : ""}{r.bySupplier.some((b) => b.freight === null) ? `${r.unpricedLines.length ? ", " : ""}freight unknown` : ""}
              </span>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex h-3 rounded-full overflow-hidden bg-surface-muted">
              {r.bySupplier.map((b) => <div key={b.supplierId} style={{ width: `${(b.subtotal / (r.subtotal || 1)) * 100}%`, background: colorOf(b.supplierId) }} />)}
            </div>
            <ul className="divide-y divide-line">
              {r.bySupplier.map((b) => {
                const s = cmp.suppliers.find((x) => x.supplier.id === b.supplierId)!;
                return (
                  <li key={b.supplierId} className="flex items-center gap-3 py-2 text-[13.5px]">
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ background: colorOf(b.supplierId) }} />
                    <span className="font-semibold flex-1 min-w-0 truncate">{b.supplierName}</span>
                    <span className="text-ink-muted text-[12.5px] hidden sm:inline" title={s.qualification.label}>{s.qualification.status === "qualified_verified" ? "verified" : s.qualification.status === "qualified_claimed" ? "claims only" : "not qualified"}</span>
                    <span className="text-ink-muted num w-16 text-right">{b.lines} lines</span>
                    <span className="num font-semibold w-28 text-right">{b.total === null ? <span className="text-warn-strong" title={b.freightNote}>freight ?</span> : inrCompact(b.total)}</span>
                  </li>
                );
              })}
            </ul>
            {r.excludedSuppliers.length > 0 && <div className="text-[12.5px] text-ink-muted">Left out: {r.excludedSuppliers.map((e) => `${short(e.name)} (${e.why.replace(/^Not qualified \(fails /, "fails ").replace(/\)$/, "")})`).join(" · ")}</div>}
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <button className="btn-ghost btn-sm" onClick={() => setLines(!lines)}>
              <ChevronDown className={clsx("w-3.5 h-3.5 transition-transform", lines && "rotate-180")} /> Line by line
            </button>
            <a className="btn-ghost btn-sm" href={exportHref}><ArrowDownToLine className="w-3.5 h-3.5" /> Excel</a>
          </div>
          {lines && (
            <div className="overflow-auto max-h-96 border border-line rounded-md">
              <table className="tbl">
                <thead>
                  <tr><th>Line</th><th>Supplier</th><th className="text-right">Per unit</th><th className="text-right">Total</th></tr>
                </thead>
                <tbody>
                  {r.awards.map((a) => (
                    <tr key={a.lineId}><td>L{a.lineNo} {a.description}</td><td>{short(a.supplierName)}</td><td className="text-right num">{inr(a.unitPrice)}</td><td className="text-right num">{inrCompact(a.extended)}</td></tr>
                  ))}
                  {r.unpricedLines.map((u) => (
                    <tr key={`u${u.lineNo}`}><td>L{u.lineNo} {u.description}</td><td colSpan={3} className="text-warn-strong">No eligible price — {u.why}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card p-5 space-y-3">
          <h2 className="font-bold text-[16px]">Your recommendation</h2>
          {confirmed && (
            <div className="rounded-md bg-ok/10 px-3 py-2 text-[13px] flex gap-2">
              <CheckCircle2 className="w-4 h-4 text-ok-strong shrink-0 mt-0.5" />
              <span>Recorded <b>{confirmed.scenario?.title}</b> at {inrCompact(confirmed.scenario?.total)} — {confirmed.decided_by_email}, {fmtDateTime(confirmed.created_at)}</span>
            </div>
          )}
          {affected.length > 0 && (
            <a href={`/rfx/${rfqId}/exceptions`} className="block rounded-md bg-warn/15 px-3 py-2 text-[13px] hover:bg-warn/25">
              <AlertTriangle className="w-3.5 h-3.5 inline mr-1 text-warn-strong" /> {affected.length} open issue{affected.length > 1 ? "s" : ""} on these suppliers{critical.length ? ` (${critical.length} critical)` : ""}
            </a>
          )}
          <textarea className="input min-h-[150px] text-[13px]" value={rationale} onChange={(e) => setRationale(e.target.value)} placeholder="Why this option, which risks you accept, what to confirm before the PO…" />
          <button
            className="btn-ghost btn-sm"
            disabled={!!busy}
            onClick={async () => {
              setBusy("ai");
              setErr(null);
              const res = await fetch(`/api/rfx/${rfqId}/decision/draft`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scenario: r, exceptions: affected }) });
              const j = await readJson(res);
              setBusy(null);
              if (!res.ok) return setErr(j.error);
              setRationale(j.text);
            }}
          >
            {busy === "ai" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5 text-brand-mid" />} Draft it with Copilot
          </button>
          {critical.length > 0 && (
            <label className="flex items-start gap-2 text-[12.5px]">
              <input type="checkbox" className="mt-0.5" checked={ack} onChange={(e) => setAck(e.target.checked)} /> I&apos;ve seen the critical issues and still recommend this.
            </label>
          )}
          {err && <div className="chip chip-bad !whitespace-normal">{err}</div>}
          <div className="flex gap-2">
            <button className="btn-primary flex-1 h-9" disabled={!!busy || rationale.trim().length < 20 || (critical.length > 0 && !ack)} onClick={() => save("buyer_confirmed")}>
              {busy === "buyer_confirmed" && <Loader2 className="w-4 h-4 animate-spin" />} Record recommendation
            </button>
            <button className="btn-secondary h-9" disabled={!!busy || !rationale.trim()} onClick={() => save("draft")}>Save draft</button>
          </div>
          <p className="text-[12px] text-ink-muted">Nothing is awarded automatically. This logs your choice, its numbers and your reasoning.</p>
        </section>
      </div>
    </div>
  );
}
