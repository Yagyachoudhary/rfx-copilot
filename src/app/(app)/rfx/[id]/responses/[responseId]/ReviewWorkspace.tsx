"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileType2,
  Loader2,
  Mail,
  Pencil,
  RotateCcw,
  ShieldCheck,
  Table2,
  X,
} from "lucide-react";
import { SourceViewer, type Target } from "@/components/SourceViewer";

type Any = any;
const BASIS: Record<string, string> = { per_unit: "per unit", per_n_units: "per N", per_pack: "per pack", per_kg: "per kg", lump_sum: "lump sum", unknown: "unclear" };
const money = (ccy: string | null | undefined, n: number | null | undefined) =>
  n === null || n === undefined ? "—" : `${ccy === "USD" ? "$" : "₹"}${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 4 })}`;

function fileIcon(name: string) {
  const n = name.toLowerCase();
  if (/\.(xlsx|csv)$/.test(n)) return <FileSpreadsheet className="w-3.5 h-3.5 text-ok-strong" />;
  if (/\.(jpe?g|png|webp)$/.test(n)) return <FileImage className="w-3.5 h-3.5 text-accent" />;
  if (/\.pdf$/.test(n)) return <FileType2 className="w-3.5 h-3.5 text-bad-strong" />;
  if (/\.(eml|txt)$/.test(n)) return <Mail className="w-3.5 h-3.5" />;
  return <FileText className="w-3.5 h-3.5 text-brand-mid" />;
}

type Task = {
  key: string;
  kind: string;
  title: string;
  context?: string | null;
  excIds: string[];
  target: Target;
  ex?: Any;
  options?: { label: string; sub?: string; act: () => Promise<void> }[];
  input?: { placeholder: string; suffix?: string; apply: (v: string) => Promise<void> };
  extra?: { label: string; act: () => Promise<void> }[];
};

const HEADSUP = new Set(["coverage_gap", "unresolved_reference", "freight_unquantified", "freight_not_stated", "tax_not_stated", "questionnaire_missing", "questionnaire_fail"]);

export function ReviewWorkspace(props: Any) {
  const { rfqId, response, lines, files, extracted, normalized, qa, exceptions } = props;
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [pane, setPane] = useState<string>(files.find((f: Any) => f.file_kind !== "attachment")?.id ?? files[0]?.id ?? "lines");
  const [target, setTarget] = useState<Target>(null);
  const [showDone, setShowDone] = useState(false);
  const [edit, setEdit] = useState<Any | null>(null);

  const lineById = useMemo(() => new Map<string, Any>(lines.map((l: Any) => [l.id, l])), [lines]);
  const exById = useMemo(() => new Map<string, Any>(extracted.map((e: Any) => [e.id, e])), [extracted]);
  const normByEx = useMemo(() => new Map<string, Any>(normalized.map((n: Any) => [n.extracted_line_id, n])), [normalized]);
  const t = response.terms ?? {};
  const quoteFile = files.find((f: Any) => f.file_kind !== "attachment") ?? files[0];
  const attachment = files.find((f: Any) => f.file_kind === "attachment");
  const ccyOf = (e: Any) => e?.raw_currency ?? t.currency ?? "INR";

  const run = async (key: string, fn: () => Promise<Response>) => {
    setBusy(key);
    setErr(null);
    try {
      const r = await fn();
      if (!r.ok) throw new Error((await r.json()).error ?? "Failed");
      router.refresh();
    } catch (e: Any) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  };
  const post = (url: string, body: Any) => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const override = (lineId: string, changes: Any, reason: string) => post(`/api/responses/${response.id}/override`, { extractedLineId: lineId, changes, reason });
  const exc = (id: string, action: string, note: string) => post(`/api/exceptions/${id}`, { action, note });
  const tgt = (e: Any): Target => (e ? { fileId: e.source_file_id ?? quoteFile?.id, loc: e.source_location, snippet: e.source_snippet } : null);
  const lineLabel = (id: string | null | undefined) => {
    const l = id ? lineById.get(id) : null;
    return l ? `L${l.line_no} ${l.description}` : "";
  };

  const open = exceptions.filter((x: Any) => x.status === "open" && x.severity !== "info");
  const tasks: Task[] = [];
  const headsUps: Any[] = [];
  const groupedUom: Any[] = [];
  for (const x of open) {
    const e = x.extracted_line_id ? exById.get(x.extracted_line_id) : null;
    const key = x.id;
    if (HEADSUP.has(x.type)) {
      headsUps.push(x);
      continue;
    }
    switch (x.type) {
      case "conflicting_values": {
        const rows = extracted.filter((r: Any) => {
          const n = normByEx.get(r.id);
          return n && n.rfq_line_id === x.rfq_line_id && n.status === "needs_review";
        });
        tasks.push({
          key, kind: x.type, excIds: [x.id], target: tgt(rows[0] ?? e),
          title: `${lineLabel(x.rfq_line_id)} is priced twice`,
          context: "Pick the price that's valid.",
          options: rows.map((r: Any) => ({
            label: money(ccyOf(r), r.raw_unit_price),
            sub: r.source_location?.cell ? `cell ${r.source_location.cell}` : r.raw_text,
            act: async () => run(key, () => override(r.id, { choose_in_conflict: true }, `Selected ${r.raw_unit_price} among conflicting prices`)),
          })),
        });
        break;
      }
      case "ambiguous_mapping": {
        if (!e) break;
        const nums = Array.from(new Set([lineById.get(e.mapped_line_id)?.line_no, ...(e.mapping_candidates ?? []).map((c: Any) => c.line_no)].filter(Boolean))) as number[];
        tasks.push({
          key, kind: x.type, excIds: [x.id], target: tgt(e), ex: e,
          title: `Which line is this?`,
          context: `“${e.raw_text}” · ${money(ccyOf(e), e.raw_unit_price)}`,
          options: [
            ...nums.map((n) => {
              const l = lines.find((y: Any) => y.line_no === n);
              return { label: `L${n}`, sub: l?.description, act: async () => run(key, () => override(e.id, { mapped_line_id: l.id }, `Mapped to L${n} by buyer`)) };
            }),
            { label: "Neither", sub: "exclude", act: async () => run(key, () => override(e.id, { exclude: true }, "Not an RFQ line (buyer)")) },
          ],
        });
        break;
      }
      case "pack_size_missing":
        if (!e) break;
        tasks.push({
          key, kind: x.type, excIds: [x.id], target: tgt(e), ex: e,
          title: `${lineLabel(x.rfq_line_id)}: how many per box?`,
          context: `Quoted ${money(ccyOf(e), e.raw_unit_price)} per box — pack size not stated`,
          input: { placeholder: "e.g. 24", suffix: `${lineById.get(x.rfq_line_id)?.uom ?? "units"} / box`, apply: async (v) => run(key, () => override(e.id, { raw_price_basis: "per_pack", raw_basis_quantity: Number(v) }, `Pack size ${v} confirmed by buyer`)) },
        });
        break;
      case "unreadable_value":
      case "missing_price":
        if (!e) break;
        tasks.push({
          key, kind: x.type, excIds: [x.id], target: tgt(e), ex: e,
          title: `${lineLabel(x.rfq_line_id)}: price unreadable`,
          context: "Read it from the source, or leave it out.",
          input: { placeholder: "Price as quoted", suffix: `${ccyOf(e)} / ${lineById.get(x.rfq_line_id)?.uom ?? "unit"}`, apply: async (v) => run(key, () => override(e.id, { raw_unit_price: Number(v), raw_price_basis: e.raw_price_basis === "unknown" ? "per_unit" : e.raw_price_basis, raw_currency: ccyOf(e) }, `Price ${v} read from source by buyer`)) },
          extra: [{ label: "Leave out", act: async () => run(key, () => override(e.id, { exclude: true }, "Unreadable — excluded by buyer")) }],
        });
        break;
      case "uom_mismatch":
        groupedUom.push({ x, e });
        break;
      case "price_outlier": {
        if (!e) break;
        const n = normByEx.get(e.id);
        tasks.push({
          key, kind: x.type, excIds: [x.id], target: tgt(e), ex: e,
          title: `${lineLabel(x.rfq_line_id)} looks wrong`,
          context: x.title.replace(/^L\d+:\s*/, "").replace("price is", `₹${n?.unit_price_base ?? e.raw_unit_price} is`),
          options: [
            { label: "Leave it out", act: async () => run(key, () => override(e.id, { exclude: true }, "Outlier — excluded by buyer")) },
            { label: "It's correct", act: async () => run(key, () => exc(x.id, "resolve", "Buyer confirmed the price")) },
          ],
          input: { placeholder: "Correct price", suffix: ccyOf(e), apply: async (v) => run(key, () => override(e.id, { raw_unit_price: Number(v) }, `Corrected to ${v} (typo)`)) },
        });
        break;
      }
      case "currency_unknown":
        if (!e) break;
        tasks.push({
          key, kind: x.type, excIds: [x.id], target: tgt(e), ex: e,
          title: `${lineLabel(x.rfq_line_id)}: which currency?`,
          options: ["INR", "USD"].map((c) => ({ label: c, act: async () => run(key, () => override(e.id, { raw_currency: c }, `Currency set to ${c} by buyer`)) })),
        });
        break;
      case "unverified_claim": {
        const qn = Number(String(x.fingerprint).split(":")[1]);
        const item = qa.find((y: Any) => y.q.q_no === qn);
        if (!item?.a) break;
        const docAttached = item.a.evidence_type === "document_attached";
        tasks.push({
          key, kind: x.type, excIds: [x.id],
          target: docAttached && attachment ? { fileId: attachment.id, loc: {}, snippet: item.a.evidence_snippet } : { fileId: quoteFile?.id, loc: item.a.source_location, snippet: item.a.raw_answer },
          title: docAttached ? `Check the certificate (Q${qn})` : `Q${qn} is a claim without proof`,
          context: `“${item.a.raw_answer}”`,
          options: [
            { label: docAttached ? "Certificate is valid" : "Mark verified", act: async () => run(key, () => post(`/api/answers/${item.a.id}`, { action: "verify", note: docAttached ? "Certificate reviewed by buyer" : "Verified by buyer" })) },
            { label: "Reject", act: async () => run(key, () => post(`/api/answers/${item.a.id}`, { action: "reject", note: "Rejected by buyer" })) },
          ],
        });
        break;
      }
      default:
        tasks.push({
          key, kind: x.type, excIds: [x.id], target: tgt(e), ex: e,
          title: x.title,
          context: e ? `${money(ccyOf(e), e.raw_unit_price)} · ${e.raw_text}` : x.explanation,
          options: [{ label: "Looks right", act: async () => run(key, () => exc(x.id, "resolve", "Checked against source by buyer")) }],
        });
    }
  }
  if (groupedUom.length) {
    const first = groupedUom[0].e;
    const unit = first?.raw_price_basis === "per_kg" ? "per kg" : "in a different unit";
    tasks.push({
      key: "uom",
      kind: "uom_mismatch",
      excIds: groupedUom.map((g) => g.x.id),
      target: tgt(first),
      title: `${groupedUom.length} line${groupedUom.length > 1 ? "s" : ""} priced ${unit}`,
      context: `${groupedUom.map((g) => lineById.get(g.x.rfq_line_id)?.line_no).filter(Boolean).map((n: number) => `L${n}`).join(", ")} — can't compare per piece without box weights`,
      options: [
        { label: "Leave out", act: async () => run("uom", async () => { let r: Any; for (const g of groupedUom) r = await override(g.e.id, { exclude: true }, "Priced per kg — excluded until per-piece price is received"); return r; }) },
        { label: "Keep for follow-up", act: async () => run("uom", async () => { let r: Any; for (const g of groupedUom) r = await exc(g.x.id, "accept_risk", "Asked supplier for per-piece prices"); return r; }) },
      ],
    });
  }
  const done = exceptions.filter((x: Any) => x.status !== "open" && x.severity !== "info");
  const cleanCount = normalized.filter((n: Any) => n.status === "comparable").length;
  const covered = new Set(normalized.filter((n: Any) => n.rfq_line_id && n.status !== "excluded").map((n: Any) => n.rfq_line_id)).size;

  const terms: { label: string; tone?: "warn" | "info"; tip?: string | null }[] = [
    { label: t.currency ?? "Currency?", tone: !t.currency ? "warn" : t.currency !== "INR" ? "info" : undefined, tip: t.currency_evidence },
    { label: t.tax_treatment === "inclusive" ? `GST incl. ${t.tax_rate_percent ?? "?"}%` : t.tax_treatment === "exclusive" ? "GST extra" : "GST?", tone: t.tax_treatment === "inclusive" ? "info" : !t.tax_treatment || t.tax_treatment === "not_stated" ? "warn" : undefined, tip: t.tax_text },
    { label: t.freight?.type === "included" ? "Freight incl." : t.freight?.type === "extra_percent" ? `Freight +${t.freight.percent}%` : t.freight?.type === "extra_unquantified" ? "Freight extra (?)" : "Freight?", tone: ["extra_unquantified", "not_stated"].includes(t.freight?.type ?? "not_stated") ? "warn" : t.freight?.type === "extra_percent" ? "info" : undefined, tip: t.freight?.text },
    ...(t.payment_days ? [{ label: `${t.payment_days}d credit`, tip: t.payment_terms }] : []),
    ...(t.lead_time_days ? [{ label: `${t.lead_time_days}d lead`, tip: t.lead_time_text }] : []),
    ...(t.validity_days ? [{ label: `Valid ${t.validity_days}d` }] : []),
    ...(t.discounts ?? []).map((d: Any) => ({ label: `${d.percent ?? "?"}% off${d.conditional ? " if…" : ""}`, tone: "info" as const, tip: `${d.description}${d.condition ? ` — ${d.condition}` : ""}` })),
  ];

  const pick = (task: Task) => {
    setSel(task.key);
    setTarget(task.target);
    if (task.target?.fileId) setPane(task.target.fileId);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/rfx/${rfqId}/responses`} className="btn-ghost px-2" aria-label="Back to responses"><ArrowLeft className="w-4 h-4" /></Link>
        <div className="min-w-0">
          <h2 className="text-[17px] font-bold leading-tight">{response.supplier.name}{response.version > 1 && <span className="ml-2 chip chip-info align-middle">v{response.version}</span>}</h2>
          <div className="text-[12px] text-ink-muted">{covered} of {lines.length} lines quoted · {cleanCount} ready to compare</div>
        </div>
        <div className="flex flex-wrap gap-1.5 ml-auto">
          {terms.map((x, i) => (
            <span key={i} title={x.tip ?? undefined} className={clsx("chip", x.tone === "warn" ? "chip-warn" : x.tone === "info" ? "chip-info" : "chip-muted")}>{x.label}</span>
          ))}
        </div>
      </div>
      {err && <div className="chip chip-bad !whitespace-normal">{err}</div>}

      <div className="grid lg:grid-cols-[420px_1fr] gap-3 items-start">
        {/* Left: what needs a decision */}
        <div className="space-y-3 lg:sticky lg:top-16">
          <section className="card">
            <header className="px-4 py-3 flex items-center justify-between border-b border-line">
              <h3 className="font-semibold">{tasks.length ? `${tasks.length} to fix` : "Nothing to fix"}</h3>
              {tasks.length === 0 && <CheckCircle2 className="w-5 h-5 text-ok-strong" />}
            </header>
            <ul className="max-h-[calc(100vh-340px)] overflow-auto divide-y divide-line">
              {tasks.map((task) => (
                <TaskCard key={task.key} task={task} active={sel === task.key} busy={busy === task.key} onPick={() => pick(task)} />
              ))}
              {tasks.length === 0 && <li className="px-4 py-6 text-[13px] text-ink-muted">Every price in this response is either comparable or has been decided.</li>}
            </ul>
          </section>

          {headsUps.length > 0 && (
            <section className="card">
              <header className="px-4 py-2.5 border-b border-line font-semibold text-[13px]">Heads-up</header>
              <ul className="divide-y divide-line">
                {headsUps.map((x: Any) => (
                  <li key={x.id} className="px-4 py-2.5 flex items-start gap-2 text-[13px]">
                    <CircleAlert className={clsx("w-4 h-4 mt-0.5 shrink-0", x.severity === "critical" ? "text-bad-strong" : "text-warn-strong")} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium" title={x.explanation ?? undefined}>{x.type === "coverage_gap" ? x.title.replace(/^Quoted (\d+) of (\d+) lines — /, "") + " — not quoted" : x.type === "unresolved_reference" ? `“${(x.explanation ?? "").match(/"([^"]+)"/)?.[1] ?? x.title}” — not a price` : x.title}</div>
                      {x.type === "coverage_gap" && <div className="text-[12px] text-ink-muted truncate" title={x.explanation}>{(x.explanation ?? "").match(/for (.+?)\./)?.[1]}</div>}
                    </div>
                    <button className="btn-ghost btn-sm" disabled={busy === x.id} onClick={() => run(x.id, () => exc(x.id, "accept_risk", "Acknowledged during review"))}>
                      {busy === x.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3.5 h-3.5" />} OK
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {done.length > 0 && (
            <section className="card">
              <button className="w-full px-4 py-2.5 flex items-center justify-between text-[13px] font-semibold" onClick={() => setShowDone(!showDone)}>
                <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-ok-strong" /> {done.length} decided</span>
                <ChevronDown className={clsx("w-4 h-4 transition-transform", showDone && "rotate-180")} />
              </button>
              {showDone && (
                <ul className="divide-y divide-line border-t border-line">
                  {done.map((x: Any) => (
                    <li key={x.id} className="px-4 py-2 text-[12.5px] flex gap-2 items-start">
                      <div className="flex-1 min-w-0">
                        <div className="truncate">{x.title}</div>
                        <div className="text-ink-muted truncate">{x.resolution_note}</div>
                      </div>
                      <button className="btn-ghost btn-sm" title="Reopen" onClick={() => run(x.id, () => exc(x.id, "reopen", ""))}><RotateCcw className="w-3 h-3" /></button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>

        {/* Right: the evidence */}
        <section className="card overflow-hidden flex flex-col h-[calc(100vh-200px)] min-h-[520px]">
          <div className="flex items-center gap-1 px-2 border-b border-line overflow-x-auto">
            {files.map((f: Any) => (
              <button key={f.id} onClick={() => setPane(f.id)} className={clsx("flex items-center gap-1.5 px-3 py-2.5 text-[12.5px] border-b-2 -mb-px whitespace-nowrap", pane === f.id ? "border-primary font-semibold" : "border-transparent text-ink-muted hover:text-ink")}>
                {fileIcon(f.file_name)} {f.file_name}
              </button>
            ))}
            <button onClick={() => setPane("lines")} className={clsx("flex items-center gap-1.5 px-3 py-2.5 text-[12.5px] border-b-2 -mb-px whitespace-nowrap ml-auto", pane === "lines" ? "border-primary font-semibold" : "border-transparent text-ink-muted hover:text-ink")}>
              <Table2 className="w-3.5 h-3.5" /> What we read ({extracted.length})
            </button>
          </div>
          {target?.snippet && pane !== "lines" && target.fileId === pane && (
            <div className="px-4 py-2 bg-accent/5 border-b border-line text-[12.5px] flex gap-2">
              <span className="text-ink-muted shrink-0">Found:</span>
              <span className="truncate font-medium" title={target.snippet}>{target.snippet}</span>
              {target.loc?.region && <span className="text-ink-muted shrink-0">· {target.loc.region}</span>}
            </div>
          )}
          <div className="flex-1 min-h-0">
            {pane === "lines" ? (
              <LinesTable
                extracted={extracted}
                normByEx={normByEx}
                lineById={lineById}
                ccyOf={ccyOf}
                onShow={(e: Any) => { setTarget(tgt(e)); setPane(e.source_file_id ?? quoteFile?.id); }}
                onEdit={(e: Any) => setEdit(e)}
              />
            ) : (
              <SourceViewer fileId={pane} target={target} />
            )}
          </div>
        </section>
      </div>
      {edit && <EditDialog e={edit} n={normByEx.get(edit.id)} lines={lines} busy={busy === "edit"} onClose={() => setEdit(null)} onSave={async (changes: Any, reason: string) => { await run("edit", () => override(edit.id, changes, reason)); setEdit(null); }} />}
    </div>
  );
}

function TaskCard({ task, active, busy, onPick }: { task: Task; active: boolean; busy: boolean; onPick: () => void }) {
  const [v, setV] = useState("");
  return (
    <li className={clsx("px-4 py-3 cursor-pointer", active ? "bg-accent/[0.06] shadow-[inset_3px_0_0_rgb(var(--c-accent))]" : "hover:bg-surface-muted/30")} onClick={onPick}>
      <div className="font-semibold text-[13.5px] leading-snug">{task.title}</div>
      {task.context && <div className="text-[12.5px] text-ink-muted mt-0.5 line-clamp-2">{task.context}</div>}
      <div className="flex flex-wrap gap-1.5 mt-2">
        {task.options?.map((o, i) => (
          <button key={i} className="btn-secondary h-auto py-1 flex-col items-start !gap-0 text-left max-w-[190px]" disabled={busy} onClick={o.act} title={o.sub}>
            <span className="num">{o.label}</span>
            {o.sub && <span className="text-[11px] font-normal text-ink-muted truncate max-w-[170px]">{o.sub}</span>}
          </button>
        ))}
        {task.input && (
          <form
            className="flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              if (v.trim()) task.input!.apply(v.trim());
            }}
          >
            <input className="input w-24 num" inputMode="decimal" placeholder={task.input.placeholder} value={v} onChange={(e) => setV(e.target.value)} />
            {task.input.suffix && <span className="text-[12px] text-ink-muted">{task.input.suffix}</span>}
            <button className="btn-primary btn-sm" disabled={busy || !v.trim()}>{busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3.5 h-3.5" />}</button>
          </form>
        )}
        {task.extra?.map((o, i) => (
          <button key={`x${i}`} className="btn-ghost btn-sm" disabled={busy} onClick={o.act}>{o.label}</button>
        ))}
        {busy && !task.input && <Loader2 className="w-4 h-4 animate-spin text-accent self-center" />}
      </div>
    </li>
  );
}

function LinesTable({ extracted, normByEx, lineById, ccyOf, onShow, onEdit }: Any) {
  return (
    <div className="overflow-auto h-full">
      <table className="tbl">
        <thead>
          <tr>
            <th>Line</th>
            <th>Supplier wrote</th>
            <th className="text-right">Quoted</th>
            <th className="text-right">₹ per RFQ unit</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {extracted.map((e: Any) => {
            const n = normByEx.get(e.id);
            const l = n?.rfq_line_id ? lineById.get(n.rfq_line_id) : null;
            return (
              <tr key={e.id} className={clsx("cursor-pointer", n?.status === "excluded" && "opacity-45")} onClick={() => onShow(e)}>
                <td className="num font-semibold whitespace-nowrap">{l ? `L${l.line_no}` : "—"}</td>
                <td className="max-w-[280px]"><div className="truncate" title={e.raw_text}>{e.raw_text}</div></td>
                <td className="text-right num whitespace-nowrap" title={(n?.rules_applied ?? []).join("\n")}>
                  {e.raw_unit_price === null ? <span className="text-warn-strong">unreadable</span> : money(ccyOf(e), e.raw_unit_price)}
                  {e.raw_price_basis && e.raw_price_basis !== "per_unit" && <span className="text-ink-muted text-[11px] ml-1">{BASIS[e.raw_price_basis]}{e.raw_basis_quantity ? ` ${e.raw_basis_quantity}` : ""}</span>}
                </td>
                <td className="text-right num whitespace-nowrap font-semibold">
                  {n?.status === "comparable" ? (
                    <span className="inline-flex items-center gap-1">{n.has_override && <Pencil className="w-3 h-3 text-brand-mid" />}₹{Number(n.unit_price_base).toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
                  ) : n?.status === "excluded" ? (
                    <span className="text-ink-muted font-normal">left out</span>
                  ) : (
                    <span className="text-warn-strong font-normal">to fix</span>
                  )}
                </td>
                <td onClick={(x) => x.stopPropagation()}>
                  <button className="btn-ghost btn-sm" title="Edit" aria-label="Edit" onClick={() => onEdit(e)}><Pencil className="w-3.5 h-3.5" /></button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function EditDialog({ e, n, lines, busy, onClose, onSave }: Any) {
  const [mapped, setMapped] = useState<string>(n?.rfq_line_id ?? e.mapped_line_id ?? "");
  const [price, setPrice] = useState<string>(e.raw_unit_price ?? "");
  const [basis, setBasis] = useState<string>(e.raw_price_basis ?? "unknown");
  const [qty, setQty] = useState<string>(e.raw_basis_quantity ?? "");
  const [exclude, setExclude] = useState(n?.status === "excluded");
  const [note, setNote] = useState("");
  const changes: Any = {};
  if ((mapped || null) !== (n?.rfq_line_id ?? e.mapped_line_id ?? null)) changes.mapped_line_id = mapped || null;
  if (String(price) !== String(e.raw_unit_price ?? "")) changes.raw_unit_price = price === "" ? null : Number(price);
  if (basis !== (e.raw_price_basis ?? "unknown")) changes.raw_price_basis = basis;
  if (String(qty) !== String(e.raw_basis_quantity ?? "")) changes.raw_basis_quantity = qty === "" ? null : Number(qty);
  if (exclude !== (n?.status === "excluded")) changes.exclude = exclude;
  const count = Object.keys(changes).length;
  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" role="dialog" aria-modal="true">
      <div className="card w-full max-w-md p-5 space-y-3 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="font-bold">Edit “{e.raw_text}”</h3>
          <button className="btn-ghost btn-sm" onClick={onClose} aria-label="Close"><X className="w-4 h-4" /></button>
        </div>
        <select className="input" value={mapped} onChange={(x) => setMapped(x.target.value)}>
          <option value="">Not an RFQ line</option>
          {lines.map((l: Any) => <option key={l.id} value={l.id}>L{l.line_no} · {l.description}</option>)}
        </select>
        <div className="grid grid-cols-3 gap-2">
          <input className="input num" type="number" step="any" value={price} onChange={(x) => setPrice(x.target.value)} placeholder="Price" />
          <select className="input" value={basis} onChange={(x) => setBasis(x.target.value)}>
            {Object.entries(BASIS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input className="input num" type="number" step="any" value={qty} onChange={(x) => setQty(x.target.value)} placeholder="N / pack" disabled={!["per_n_units", "per_pack"].includes(basis)} />
        </div>
        <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={exclude} onChange={(x) => setExclude(x.target.checked)} /> Leave this line out</label>
        <input className="input" value={note} onChange={(x) => setNote(x.target.value)} placeholder="Why? (optional)" />
        <p className="text-[12px] text-ink-muted flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" /> The original reading is kept; your edit is logged with your name.</p>
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={busy || !count} onClick={() => onSave(changes, note.trim() || "Edited by buyer")}>{busy && <Loader2 className="w-4 h-4 animate-spin" />} Save</button>
        </div>
      </div>
    </div>
  );
}
