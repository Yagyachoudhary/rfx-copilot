import { getContext } from "@/lib/context";
import { AnalystChat } from "./AnalystChat";

export const dynamic = "force-dynamic";

export default async function AnalystPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getContext();
  const [{ data: msgs }, { count }] = await Promise.all([
    ctx.supabase.from("analyst_messages").select("id, role, content, artifacts, created_at").eq("rfq_id", id).order("created_at"),
    ctx.supabase.from("supplier_responses").select("id", { count: "exact", head: true }).eq("rfq_id", id).eq("is_active", true).in("status", ["needs_review", "ready"]),
  ]);
  return <AnalystChat rfqId={id} initial={msgs ?? []} hasData={(count ?? 0) > 0} />;
}
