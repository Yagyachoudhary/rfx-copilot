import { getContext } from "@/lib/context";
import { loadRfqBundle } from "@/lib/data";
import { Card, Empty, LinkBtn } from "@/components/ui";
import { DecisionWorkspace } from "./DecisionWorkspace";

export const dynamic = "force-dynamic";

export default async function DecisionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getContext();
  const b = await loadRfqBundle(ctx.supabase, id);
  if (!b) return null;
  if (!b.active.length)
    return (
      <Card>
        <Empty title="Nothing to decide yet" body="Receive and review supplier responses first." action={<LinkBtn href={`/rfx/${id}/responses`} variant="primary">Go to responses</LinkBtn>} />
      </Card>
    );
  const { data: decisions } = await ctx.supabase.from("award_decisions").select("*").eq("rfq_id", id).order("created_at", { ascending: false });
  const sup = new Map(b.suppliers.map((s) => [s.id, s.name]));
  const openExc = b.exceptions
    .filter((e) => e.status === "open" && e.severity !== "info")
    .map((e) => ({ id: e.id, severity: e.severity, title: e.title, supplier: e.supplier_id ? sup.get(e.supplier_id) ?? "" : "", supplierId: e.supplier_id, responseId: e.response_id }));
  return <DecisionWorkspace rfqId={id} rfq={b.rfq} cmp={b.comparison} openExceptions={openExc} decisions={decisions ?? []} />;
}
