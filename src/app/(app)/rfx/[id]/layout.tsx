import Link from "next/link";
import { notFound } from "next/navigation";
import { History, Sparkles } from "lucide-react";
import { getContext } from "@/lib/context";
import { fmtDate } from "@/components/ui";
import { FlowStepper, type Step } from "./RfxTabs";

export const dynamic = "force-dynamic";

export default async function RfxLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getContext();
  const db = ctx.supabase;
  const { data: rfq } = await db.from("rfqs").select("id, ref_code, title, status, response_deadline, currency").eq("id", id).maybeSingle();
  if (!rfq) notFound();
  const [{ data: inv }, { data: resps }, { data: exc }, { data: dec }] = await Promise.all([
    db.from("rfq_suppliers").select("delivery_status, response_status").eq("rfq_id", id),
    db.from("supplier_responses").select("id, is_active, status").eq("rfq_id", id),
    db.from("exceptions").select("severity, response_id").eq("rfq_id", id).eq("status", "open").in("severity", ["critical", "warning"]),
    db.from("award_decisions").select("status").eq("rfq_id", id).eq("status", "buyer_confirmed").limit(1),
  ]);
  const active = (resps ?? []).filter((r) => r.is_active);
  const activeIds = new Set(active.map((r) => r.id));
  const issues = (exc ?? []).filter((e) => !e.response_id || activeIds.has(e.response_id)).length;
  const invited = (inv ?? []).length;
  const sent = (inv ?? []).filter((i) => i.delivery_status !== "not_sent").length;
  const busy = active.filter((r) => ["received", "parsing", "extracting", "normalizing"].includes(r.status)).length;
  const base = `/rfx/${id}`;
  const steps: Step[] = [
    { href: base, label: "Draft", status: rfq.status === "draft" ? "In progress" : "Done", state: rfq.status === "draft" ? "current" : "done", exact: true },
    { href: `${base}/send`, label: "Send", status: sent ? `Sent to ${sent}` : "Not sent", state: sent ? "done" : rfq.status === "draft" ? "todo" : "current" },
    {
      href: `${base}/responses`,
      label: "Responses",
      status: busy ? `Reading ${busy}…` : `${active.length} of ${invited} in${issues ? ` · ${issues} to fix` : ""}`,
      state: !sent ? "todo" : issues || active.length < invited ? "current" : "done",
      warn: issues > 0,
      match: [`${base}/responses`, `${base}/exceptions`],
    },
    { href: `${base}/compare`, label: "Compare", status: active.length ? `${active.length} suppliers` : "Waiting", state: active.length ? "current" : "todo" },
    { href: `${base}/decision`, label: "Decide", status: dec?.length ? "Recommended" : "Open", state: dec?.length ? "done" : active.length ? "current" : "todo" },
  ];
  return (
    <div className="max-w-[1440px] mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <div className="text-[12px] text-ink-muted">
            <Link href="/" className="hover:text-accent">Events</Link> / <span className="num">{rfq.ref_code}</span> · due {fmtDate(rfq.response_deadline)}
          </div>
          <h1 className="text-[20px] font-bold leading-tight mt-0.5">{rfq.title}</h1>
        </div>
        <div className="flex gap-2">
          <Link href={`${base}/analyst`} className="btn-secondary"><Sparkles className="w-4 h-4 text-brand-mid" /> Ask the analyst</Link>
          <Link href={`${base}/activity`} className="btn-ghost" title="Activity log" aria-label="Activity log"><History className="w-4 h-4" /></Link>
        </div>
      </div>
      <FlowStepper steps={steps} />
      <div className="mt-5">{children}</div>
    </div>
  );
}
