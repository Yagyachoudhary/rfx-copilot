"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowDownToLine, CheckCircle2, Gavel, Loader2, Scale, Wand2 } from "lucide-react";
import { computeScenario, inr, inrCompact, type Comparison, type ScenarioOptions, type ScenarioResult } from "@/lib/compare";
import { AiBadge, Card, cx, fmtDateTime, QualificationChip } from "@/components/ui";

const base: ScenarioOptions = { mode: "split_cheapest", onlyQualified: false, requireVerified: false, includeFreight: true, applyConditionalDiscounts: false, excludeFlagged: true };

export function DecisionWorkspace({ rfqId, rfq, cmp, openExceptions, decisions }: { rfqId: string; rfq: any; cmp: Comparison; openExceptions: any[]; decisions: any[] }) {
  const router = useRouter();
  const responding = cmp.suppliers.filter((s) => s.response);
  const [opts, setOpts] = useState<ScenarioOptions>(base);
  const [rationale, setRationale] = useState("");
  const [aiDrafted, setAiDrafted] = useState(false);
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const presets = useMemo(() => {
    const list: { label: string; o: ScenarioOptions }[] = [
      { label: "Split · cheapest per line · all suppliers", o: { ...base } },
      { label: "Split · cheapest per line · qualified only", o: { ...base, onlyQualified: true } },
    ];
    for (const s of responding.filter((s) => s.comparableCount >= cmp.lines.length * 0.5)) list.push({ label: `Single award · ${s.supplier.name}`, o: { ...base, mode: "single_supplier", supplierId: s.supplier.id } });
    return list.map((p) => ({ ...p, r: computeScenario(cmp, p.o, rfq.currency) }));
  }, [cmp, responding, rfq.currency]);
  const r: ScenarioResult = useMemo(() => computeScenario(cmp, opts, rfq.currency), [cmp, opts, rfq.currency]);
  const affected = openExceptions.filter((e) => r.bySupplier.some((b) => b.supplierId === e.supplierId));
  const critical = affected.filter((e) => e.severity === "critical");
  const exportHref = `/api/rfx/${rfqId}/export?mode=${opts.mode}${opts.supplierId ? `&supplierId=${opts.supplierId}` : ""}&q=${opts.onlyQualified ? 1 : 0}&v=${opts.requireVerified ? 1 : 0}&f=${opts.includeFreight ? 1 : 0}&d=${opts.applyConditionalDiscounts ? 1 : 0}&x=${opts.excludeFlagged ? 1 : 0}`;

  async function save(status: "draft" | "buyer_confirmed") {
    setBusy(status);
    setErr(null);
    const res = await fetch(`/api/rfx/${rfqId}/decision`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status, options: opts, scenario: r, rationale, aiDrafted, acknowledgedExceptions: affected.map((a) => a.id) }),
    });
    const j = await res.json();
    setBusy(null);
    if (!res.ok) return setErr(j.error);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
        {presets.map((p) => (
          <button key={p.label} onClick={() => setOpts(p.o)} className={cx("card text-left p-3 hover:border-accent", JSON.stringify(p.o) === JSON.stringify(opts) && "border-accent ring-1 ring-accent")}>
            <div className="text-[12px] font-semibold text-ink-muted">{p.label}</div>
            <div className="text-[20px] font-bold num mt-1">{inrCompact(p.r.total)}</div>
            <div className="text-[11.5px] text-ink-muted">
              {p.r.awards.length}/{cmp.lines.length} lines priced · {p.r.bySupplier.length} supplier{p.r.bySupplier.length === 1 ? "" : "s"}
            </div>
            {!p.r.totalIsComplete && <div className="text-[11.5px] text-warn-strong font-semibold mt-0.5">Incomplete: {p.r.unpricedLines.length} unpriced{p.r.bySupplier.some((b) => b.freight === null) ? ", freight unknown" : ""}</div>}
          </button>
        ))}
      </div>

      <div className="grid xl:grid-cols-[1fr_380px] gap-4">
        <div className="space-y-4 min-w-0">
          <Card
            title={<span className="inline-flex items-center gap-1.5"><Scale className="w-4 h-4" /> {r.title}</span>}
            actions={<a className="btn-secondary btn-sm" href={exportHref}><ArrowDownToLine className="w-3.5 h-3.5" /> Export scenario XLSX</a>}
          >
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-[13px] mb-4">
              <label className="flex items-center gap-1.5">
                Mode
                <select className="input w-auto h-7" value={opts.mode} onChange={(e) => setOpts({ ...opts, mode: e.target.value as any, supplierId: e.target.value === "single_supplier" ? opts.supplierId ?? responding[0]?.supplier.id : undefined })}>
                  <option value="split_cheapest">Split — cheapest per line</option>
                  <option value="single_supplier">Single supplier</option>
                </select>
              </label>
              {opts.mode === "single_supplier" && (
                <select className="input w-auto h-7" value={opts.supplierId} onChange={(e) => setOpts({ ...opts, supplierId: e.target.value })}>
                  {responding.map((s) => <option key={s.supplier.id} value={s.supplier.id}>{s.supplier.name}</option>)}
                </select>
              )}
              <Toggle label="Qualified suppliers only" v={opts.onlyQualified} on={(v) => setOpts({ ...opts, onlyQualified: v })} />
              <Toggle label="Require verified evidence" v={opts.requireVerified} on={(v) => setOpts({ ...opts, requireVerified: v })} />
              <Toggle label="Include freight" v={opts.includeFreight} on={(v) => setOpts({ ...opts, includeFreight: v })} />
              <Toggle label="Apply conditional discounts" v={opts.applyConditionalDiscounts} on={(v) => setOpts({ ...opts, applyConditionalDiscounts: v })} />
              <Toggle label="Exclude flagged prices" v={opts.excludeFlagged} on={(v) => setOpts({ ...opts, excludeFlagged: v })} />
            </div>

            <div className="grid sm:grid-cols-4 gap-3 mb-4">
              <Kpi label="Basic value" v={inr(r.subtotal, 0)} />
              <Kpi label="Freight" v={inr(r.freightTotal, 0)} warn={r.bySupplier.some((b) => b.freight === null)} />
              <Kpi label="Discounts" v={r.discountTotal ? `−${inr(r.discountTotal, 0)}` : "—"} />
              <Kpi label="Evaluated total" v={inr(r.total, 0)} strong warn={!r.totalIsComplete} />
            </div>
            {!r.totalIsComplete && (
              <div className="chip chip-warn !whitespace-normal !rounded-md mb-3 w-full">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> This total is incomplete: {r.unpricedLines.length} line(s) have no eligible comparable price{r.bySupplier.some((b) => b.freight === null) ? " and freight is unknown for at least one supplier" : ""}. It is not a full-scope cost.
              </div>
            )}

            <table className="tbl mb-4">
              <thead>
                <tr>
                  <th>Supplier</th>
                  <th>Qualification</th>
                  <th className="text-right">Lines</th>
                  <th className="text-right">Basic</th>
                  <th className="text-right">Freight</th>
                  <th className="text-right">Discount</th>
                  <th className="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {r.bySupplier.map((b) => {
                  const s = cmp.suppliers.find((x) => x.supplier.id === b.supplierId)!;
                  return (
                    <tr key={b.supplierId}>
                      <td className="font-semibold">{b.supplierName}</td>
                      <td><QualificationChip status={s.qualification.status} label={s.qualification.label} /></td>
                      <td className="text-right num">{b.lines}</td>
                      <td className="text-right num">{inr(b.subtotal, 0)}</td>
                      <td className="text-right num">{b.freight === null ? <span className="text-warn-strong">unknown</span> : inr(b.freight, 0)}<div className="text-[11px] text-ink-muted">{b.freightNote}</div></td>
                      <td className="text-right num">{b.discount ? `−${inr(b.discount, 0)}` : "—"}</td>
                      <td className="text-right num font-semibold">{b.total === null ? "—" : inr(b.total, 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <details>
              <summary className="cursor-pointer text-[13px] font-semibold">Line-by-line award ({r.awards.length} priced, {r.unpricedLines.length} unpriced)</summary>
              <div className="overflow-auto max-h-96 mt-2">
                <table className="tbl">
                  <thead>
                    <tr><th>Line</th><th>Description</th><th>Supplier</th><th className="text-right">Unit</th><th className="text-right">Qty</th><th className="text-right">Extended</th></tr>
                  </thead>
                  <tbody>
                    {r.awards.map((a) => (
                      <tr key={a.lineId}><td className="num">L{a.lineNo}</td><td>{a.description}</td><td>{a.supplierName}</td><td className="text-right num">{inr(a.unitPrice)}</td><td className="text-right num">{a.quantity.toLocaleString("en-IN")} {a.uom}</td><td className="text-right num">{inr(a.extended, 0)}</td></tr>
                    ))}
                    {r.unpricedLines.map((u) => (
                      <tr key={`u${u.lineNo}`} className="hatch"><td className="num">L{u.lineNo}</td><td>{u.description}</td><td colSpan={4} className="text-warn-strong font-semibold">Unpriced — {u.why}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </Card>

          <Card title="Assumptions & exclusions">
            <ul className="list-disc pl-5 text-[13px] space-y-0.5">{r.assumptions.map((a, i) => <li key={i}>{a}</li>)}</ul>
            {r.excludedSuppliers.length > 0 && (
              <div className="mt-2 text-[13px]">
                <span className="font-semibold">Excluded suppliers:</span> {r.excludedSuppliers.map((e) => `${e.name} (${e.why})`).join("; ")}
              </div>
            )}
          </Card>
        </div>

        <aside className="space-y-4">
          <Card title={`Unresolved exceptions on awarded suppliers (${affected.length})`}>
            {affected.length === 0 ? (
              <div className="text-[13px] text-ok-strong flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> None open</div>
            ) : (
              <ul className="text-[12.5px] space-y-1.5 max-h-64 overflow-auto">
                {affected.map((e) => (
                  <li key={e.id} className="flex gap-1.5">
                    <span className={cx("chip shrink-0", e.severity === "critical" ? "chip-bad" : "chip-warn")}>{e.severity}</span>
                    <a href={`/rfx/${rfqId}/responses/${e.responseId}`} className="hover:text-accent"><span className="text-ink-muted">{e.supplier}:</span> {e.title}</a>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title={<span className="inline-flex items-center gap-1.5"><Gavel className="w-4 h-4" /> Buyer decision</span>}>
            <p className="text-[12px] text-ink-muted mb-2">The system never awards automatically. Record your recommendation and rationale; confirming logs your name against this exact scenario and its assumptions.</p>
            <div className="flex items-center justify-between mb-1">
              <label className="label !mb-0">Rationale</label>
              <button
                className="btn-ghost btn-sm"
                disabled={!!busy}
                onClick={async () => {
                  setBusy("ai");
                  setErr(null);
                  const res = await fetch(`/api/rfx/${rfqId}/decision/draft`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scenario: r, exceptions: affected }) });
                  const j = await res.json();
                  setBusy(null);
                  if (!res.ok) return setErr(j.error);
                  setRationale(j.text);
                  setAiDrafted(true);
                }}
              >
                {busy === "ai" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />} Draft with AI
              </button>
            </div>
            {aiDrafted && <div className="mb-1"><AiBadge label="AI-drafted from computed figures — edit before confirming" /></div>}
            <textarea className="input min-h-[170px] text-[12.5px]" value={rationale} onChange={(e) => { setRationale(e.target.value); }} placeholder="Why this scenario, what risks you accept, what you will ask suppliers before PO…" />
            {critical.length > 0 && (
              <label className="flex items-start gap-2 text-[12.5px] mt-2">
                <input type="checkbox" className="mt-0.5" checked={ack} onChange={(e) => setAck(e.target.checked)} />
                <span>I have reviewed the {critical.length} critical exception(s) on awarded suppliers and accept them for this recommendation.</span>
              </label>
            )}
            {err && <div className="chip chip-bad !whitespace-normal mt-2">{err}</div>}
            <div className="flex gap-2 mt-3">
              <button className="btn-secondary" disabled={!!busy || !rationale.trim()} onClick={() => save("draft")}>
                {busy === "draft" && <Loader2 className="w-3 h-3 animate-spin" />} Save draft
              </button>
              <button className="btn-primary" disabled={!!busy || rationale.trim().length < 20 || (critical.length > 0 && !ack)} onClick={() => save("buyer_confirmed")}>
                {busy === "buyer_confirmed" && <Loader2 className="w-3 h-3 animate-spin" />} Confirm recommendation
              </button>
            </div>
          </Card>
          {decisions.length > 0 && (
            <Card title="Decision log">
              <ul className="space-y-2 text-[12.5px]">
                {decisions.map((d) => (
                  <li key={d.id} className="border-b border-line pb-2">
                    <div className="flex items-center gap-1.5">
                      <span className={cx("chip", d.status === "buyer_confirmed" ? "chip-ok" : "chip-muted")}>{d.status === "buyer_confirmed" ? "confirmed" : d.status}</span>
                      <span className="font-semibold">{d.scenario?.title}</span>
                    </div>
                    <div className="num">{inr(d.scenario?.total, 0)} {d.scenario?.totalIsComplete ? "" : "(incomplete)"}</div>
                    <div className="text-ink-muted">{d.decided_by_email} · {fmtDateTime(d.created_at)}</div>
                    {d.rationale && <div className="mt-1 whitespace-pre-wrap line-clamp-4">{d.rationale}</div>}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}

function Toggle({ label, v, on }: { label: string; v: boolean; on: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-1.5 cursor-pointer">
      <input type="checkbox" checked={v} onChange={(e) => on(e.target.checked)} /> {label}
    </label>
  );
}

function Kpi({ label, v, strong, warn }: { label: string; v: string; strong?: boolean; warn?: boolean }) {
  return (
    <div className={cx("rounded-md border px-3 py-2", warn ? "border-warn/60 bg-warn/5" : "border-line")}>
      <div className="text-[11px] uppercase tracking-wide font-semibold text-ink-muted">{label}</div>
      <div className={cx("num", strong ? "text-[18px] font-bold" : "text-[15px] font-semibold")}>{v}</div>
    </div>
  );
}
