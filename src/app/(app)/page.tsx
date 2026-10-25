import Link from "next/link";
import { AlertTriangle, FilePlus2, Inbox, Sparkles } from "lucide-react";
import { getContext } from "@/lib/context";
import { Card, Empty, fmtDate, LinkBtn, PageHeader, RfqStatusChip, Stat } from "@/components/ui";
import { SeedDemoButton } from "./SeedDemoButton";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const ctx = await getContext();
  const db = ctx.supabase;
  const [{ data: rfqs }, { data: invites }, { data: exc }, { data: resps }] = await Promise.all([
    db.from("rfqs").select("id, ref_code, title, status, response_deadline, category, ai_draft, is_demo, created_at").order("created_at", { ascending: false }),
    db.from("rfq_suppliers").select("rfq_id, response_status, delivery_status"),
    db.from("exceptions").select("rfq_id, severity, status, response_id").eq("status", "open"),
    db.from("supplier_responses").select("id, rfq_id, status, is_active"),
  ]);
  const activeResp = new Set((resps ?? []).filter((r) => r.is_active).map((r) => r.id));
  const rows = (rfqs ?? []).map((r) => {
    const inv = (invites ?? []).filter((i) => i.rfq_id === r.id);
    const ex = (exc ?? []).filter((e) => e.rfq_id === r.id && (!e.response_id || activeResp.has(e.response_id)));
    const processing = (resps ?? []).filter((x) => x.rfq_id === r.id && x.is_active && ["parsing", "extracting", "normalizing", "received"].includes(x.status)).length;
    return {
      ...r,
      invited: inv.filter((i) => i.delivery_status !== "not_sent").length,
      responded: inv.filter((i) => i.response_status === "responded").length,
      total: inv.length,
      critical: ex.filter((e) => e.severity === "critical").length,
      warning: ex.filter((e) => e.severity === "warning").length,
      processing,
    };
  });
  const open = rows.filter((r) => !["decided", "cancelled"].includes(r.status));
  return (
    <div className="max-w-6xl">
      <PageHeader
        eyebrow={ctx.orgName}
        title="Sourcing events"
        subtitle="Active RFx events, supplier response progress and what needs a buyer's attention."
        actions={
          <>
            <SeedDemoButton />
            <LinkBtn href="/rfx/new" variant="primary">
              <FilePlus2 className="w-4 h-4" /> Create RFx
            </LinkBtn>
          </>
        }
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Stat label="Open events" value={open.length} />
        <Stat label="Responses received" value={rows.reduce((a, r) => a + r.responded, 0)} hint={`of ${rows.reduce((a, r) => a + r.total, 0)} invited suppliers`} />
        <Stat label="Critical exceptions" value={rows.reduce((a, r) => a + r.critical, 0)} tone={rows.some((r) => r.critical) ? "bad" : undefined} hint="block a defensible award" />
        <Stat label="Warnings to review" value={rows.reduce((a, r) => a + r.warning, 0)} tone={rows.some((r) => r.warning) ? "warn" : undefined} />
      </div>
      <Card pad={false}>
        {rows.length === 0 ? (
          <Empty
            icon={<Sparkles className="w-8 h-8" />}
            title="No sourcing events yet"
            body="Create an RFx with the AI co-pilot, or load the demo event (30 lines of corrugated packaging, 5 suppliers)."
            action={
              <div className="flex gap-2">
                <SeedDemoButton primary />
                <LinkBtn href="/rfx/new">Create RFx</LinkBtn>
              </div>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Status</th>
                  <th>Responses</th>
                  <th>Needs attention</th>
                  <th>Deadline</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="min-w-[320px]">
                      <Link href={`/rfx/${r.id}`} className="font-semibold hover:text-accent">
                        {r.title}
                      </Link>
                      <div className="text-[12px] text-ink-muted flex gap-2 items-center">
                        <span className="num">{r.ref_code}</span>·<span>{r.category}</span>
                        {r.is_demo && <span className="chip chip-muted">demo data</span>}
                        {r.ai_draft && <span className="chip chip-brand">AI-drafted</span>}
                      </div>
                    </td>
                    <td><RfqStatusChip status={r.status} /></td>
                    <td className="min-w-[160px]">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-24 bg-surface-muted rounded-full overflow-hidden">
                          <div className="h-full bg-primary" style={{ width: `${r.total ? (r.responded / r.total) * 100 : 0}%` }} />
                        </div>
                        <span className="num text-[12px]">{r.responded}/{r.total}</span>
                      </div>
                      {r.processing > 0 && <div className="text-[11px] text-ink-muted mt-0.5">{r.processing} processing…</div>}
                    </td>
                    <td>
                      <div className="flex gap-1.5 flex-wrap">
                        {r.critical > 0 && <span className="chip chip-bad"><AlertTriangle className="w-3 h-3" />{r.critical} critical</span>}
                        {r.warning > 0 && <span className="chip chip-warn">{r.warning} warnings</span>}
                        {!r.critical && !r.warning && <span className="text-ink-muted text-[12px]">—</span>}
                      </div>
                    </td>
                    <td className="num text-[12px] whitespace-nowrap">{fmtDate(r.response_deadline)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="text-[12px] text-ink-muted mt-3 flex items-center gap-1.5"><Inbox className="w-3.5 h-3.5" /> Supplier emails are simulated in this prototype; responses are added from the event inbox.</p>
    </div>
  );
}
