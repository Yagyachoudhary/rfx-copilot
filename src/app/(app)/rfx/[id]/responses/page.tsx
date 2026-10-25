import { getContext } from "@/lib/context";
import { readManifest } from "@/lib/responses";
import { Inbox } from "./Inbox";

export const dynamic = "force-dynamic";

export default async function ResponsesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getContext();
  const db = ctx.supabase;
  const [{ data: rfq }, { data: inv }, { data: resps }] = await Promise.all([
    db.from("rfqs").select("id, is_demo").eq("id", id).single(),
    db.from("rfq_suppliers").select("*, supplier:suppliers(id, name, location, email)").eq("rfq_id", id),
    db.from("supplier_responses").select("*").eq("rfq_id", id).order("version", { ascending: false }),
  ]);
  const respIds = (resps ?? []).map((r) => r.id);
  const { data: files } = respIds.length ? await db.from("source_files").select("*").in("response_id", respIds) : { data: [] as any[] };
  const { data: exc } = respIds.length ? await db.from("exceptions").select("response_id, severity").eq("status", "open").in("severity", ["critical", "warning"]).in("response_id", respIds) : { data: [] as any[] };
  let samples: { index: number; supplierName: string; version: number; label: string; files: { name: string; path: string }[]; channel: string; received_at: string; isCorrection: boolean }[] = [];
  if (rfq?.is_demo) {
    const m = readManifest();
    samples = m.sample_responses.map((s, i) => {
      const sup = m.suppliers.find((x) => x.key === s.supplier)!;
      return {
        index: i,
        supplierName: sup.name,
        version: s.version,
        label: s.is_correction ? "Corrected re-submission" : "Original response",
        files: s.files.map((f) => ({ name: f.path.split("/").pop()!, path: f.path })),
        channel: s.channel,
        received_at: s.received_at,
        isCorrection: !!s.is_correction,
      };
    });
  }
  const rows = ((inv ?? []) as any[])
    .sort((a, b) => a.supplier.name.localeCompare(b.supplier.name))
    .map((i) => ({
      invite: { delivery_status: i.delivery_status, invited_at: i.invited_at, response_status: i.response_status, channel: i.channel },
      supplier: i.supplier,
      responses: (resps ?? [])
        .filter((r) => r.supplier_id === i.supplier_id)
        .map((r) => ({ ...r, files: (files ?? []).filter((f) => f.response_id === r.id), issues: (exc ?? []).filter((e) => e.response_id === r.id).length })),
      samples: samples.filter((s) => s.supplierName === i.supplier.name),
    }));
  return <Inbox rfqId={id} rows={rows} isDemo={!!rfq?.is_demo} />;
}
