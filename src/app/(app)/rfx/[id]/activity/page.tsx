import { getContext } from "@/lib/context";
import { Card, Empty, fmtDateTime } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Activity({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getContext();
  const { data } = await ctx.supabase.from("audit_events").select("*").eq("rfq_id", id).order("created_at", { ascending: false }).limit(300);
  return (
    <Card title="Audit trail" pad={false}>
      {!data?.length ? (
        <Empty title="No activity yet" />
      ) : (
        <table className="tbl">
          <thead>
            <tr>
              <th>When</th>
              <th>Who</th>
              <th>Action</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {data.map((e) => (
              <tr key={e.id}>
                <td className="whitespace-nowrap num text-[12px]">{fmtDateTime(e.created_at)}</td>
                <td className="text-[12px]">{e.actor_email}</td>
                <td><span className="chip chip-muted">{e.action}</span></td>
                <td className="text-[12px] text-ink-muted max-w-[640px]"><code className="whitespace-pre-wrap break-words">{JSON.stringify(e.details)}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
