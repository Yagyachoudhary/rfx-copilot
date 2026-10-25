import { getContext } from "@/lib/context";
import { loadRfqBundle } from "@/lib/data";
import { Card, Empty, Stat } from "@/components/ui";
import { ExceptionList, type Exc } from "@/components/ExceptionList";

export const dynamic = "force-dynamic";

export default async function ExceptionsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ show?: string }> }) {
  const { id } = await params;
  const { show } = await searchParams;
  const ctx = await getContext();
  const b = await loadRfqBundle(ctx.supabase, id);
  if (!b) return null;
  const sup = new Map(b.suppliers.map((s) => [s.id, s.name]));
  const lineNo = new Map(b.lines.map((l) => [l.id, l.line_no]));
  const all: Exc[] = b.exceptions.map((e: any) => ({
    ...e,
    supplierName: e.supplier_id ? sup.get(e.supplier_id) : undefined,
    lineNo: e.rfq_line_id ? lineNo.get(e.rfq_line_id) : null,
    href: e.response_id ? `/rfx/${id}/responses/${e.response_id}` : undefined,
  }));
  const list = show === "all" ? all : all.filter((e) => e.status === "open");
  const by = (s: string) => list.filter((e) => e.severity === s);
  const open = all.filter((e) => e.status === "open");
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Critical (open)" value={open.filter((e) => e.severity === "critical").length} tone={open.some((e) => e.severity === "critical") ? "bad" : undefined} hint="conflicts, unresolvable references, outliers" />
        <Stat label="Warnings (open)" value={open.filter((e) => e.severity === "warning").length} tone={open.some((e) => e.severity === "warning") ? "warn" : undefined} hint="mapping, units, pack sizes, unreadable values" />
        <Stat label="Info" value={open.filter((e) => e.severity === "info").length} hint="conversions applied, discounts found" />
        <Stat label="Resolved / risk accepted" value={all.filter((e) => e.status !== "open").length} />
      </div>
      <div className="flex gap-2 text-[13px]">
        <a className={show === "all" ? "btn-secondary btn-sm" : "btn-primary btn-sm"} href={`/rfx/${id}/exceptions`}>Open only</a>
        <a className={show === "all" ? "btn-primary btn-sm" : "btn-secondary btn-sm"} href={`/rfx/${id}/exceptions?show=all`}>Include resolved</a>
      </div>
      {list.length === 0 ? (
        <Card><Empty title="Nothing needs attention" body="No open exceptions on active responses." /></Card>
      ) : (
        (["critical", "warning", "info"] as const).map((s) =>
          by(s).length ? (
            <Card key={s} title={`${s[0].toUpperCase() + s.slice(1)} (${by(s).length})`}>
              <ExceptionList items={by(s)} showSupplier />
            </Card>
          ) : null,
        )
      )}
    </div>
  );
}
