import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, CheckCircle2, History, Loader2 } from "lucide-react";
import { CopilotButton } from "@/components/Copilot";
import { ConfirmDelete } from "@/components/ConfirmDelete";
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
  const next: { text: string; href?: string; cta?: string; tone?: "busy" | "done" } =
    rfq.status === "draft" && !sent
      ? { text: "Review the draft, then send it to suppliers.", href: `${base}/send`, cta: "Review & send" }
      : busy
        ? { text: `Reading ${busy} supplier ${busy > 1 ? "replies" : "reply"} — about a minute each. You can keep working.`, tone: "busy" }
        : active.length === 0
          ? { text: "Waiting for supplier replies. Add them as they arrive — any format works.", href: `${base}/responses`, cta: "Add replies" }
          : issues > 0
            ? { text: `${issues} thing${issues > 1 ? "s" : ""} need${issues > 1 ? "" : "s"} your decision before every price is comparable.`, href: `${base}/responses`, cta: "Fix issues" }
            : !dec?.length
              ? { text: "Every price is comparable. Compare suppliers and record your recommendation.", href: `${base}/compare`, cta: "Compare" }
              : { text: "Recommendation recorded. You can still revisit any step.", tone: "done" };
  return (
    <div className="max-w-[1440px] mx-auto">
      <div className="relative -mx-4 md:-mx-7 -mt-6 px-4 md:px-7 pt-6 pb-4 mb-1 overflow-hidden">
        <div aria-hidden className="absolute -top-24 -left-16 w-80 h-64 rounded-full opacity-[0.16]" style={{ background: "rgb(var(--c-brand-mid))" }} />
        <div aria-hidden className="absolute -top-28 right-10 w-96 h-60 rounded-[45%] opacity-[0.12]" style={{ background: "rgb(var(--c-accent))" }} />
        <div className="relative">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <div className="text-[12px] text-ink-muted">
            <Link href="/" className="hover:text-accent">Events</Link> / <span className="num">{rfq.ref_code}</span> · due {fmtDate(rfq.response_deadline)}
          </div>
          <h1 className="text-[20px] font-bold leading-tight mt-0.5">{rfq.title}</h1>
        </div>
        <div className="flex gap-2">
          <CopilotButton />
          <Link href={`${base}/activity`} className="btn-ghost" title="Activity log" aria-label="Activity log"><History className="w-4 h-4" /></Link>
          {ctx.role !== "viewer" && (
            <ConfirmDelete
              url={`/api/rfx/${id}`}
              redirectTo="/"
              title="Delete this event"
              confirmLabel="Delete event"
              body={<><p>This permanently deletes <b className="text-ink">{rfq.title}</b> ({rfq.ref_code}): its lines, supplier replies and files, issues, AI Analyst chat and decision.</p><p>This can&apos;t be undone.</p></>}
            />
          )}
        </div>
      </div>
      <FlowStepper steps={steps} />
        </div>
      </div>
      <div className={`mt-2 flex items-center gap-2 text-[13px] px-1 ${next.tone === "done" ? "text-ok-strong" : "text-ink-muted"}`}>
        {next.tone === "busy" ? <Loader2 className="w-3.5 h-3.5 animate-spin text-accent" /> : next.tone === "done" ? <CheckCircle2 className="w-3.5 h-3.5" /> : <ArrowRight className="w-3.5 h-3.5 text-primary" />}
        <span><span className="font-semibold text-ink">Next:</span> {next.text}</span>
        {next.href && <Link href={next.href} className="text-accent font-semibold hover:underline">{next.cta}</Link>}
      </div>
      <div className="mt-5">{children}</div>
    </div>
  );
}
