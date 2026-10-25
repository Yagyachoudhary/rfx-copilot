import { getContext } from "@/lib/context";
import { loadRfqBundle } from "@/lib/data";
import { Card, Empty, LinkBtn } from "@/components/ui";
import { CompareGrid } from "./CompareGrid";

export const dynamic = "force-dynamic";

export default async function ComparePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getContext();
  const b = await loadRfqBundle(ctx.supabase, id);
  if (!b) return null;
  if (!b.active.length)
    return (
      <Card>
        <Empty title="No responses to compare yet" body="Add supplier responses in the inbox; they appear here once extracted and normalized." action={<LinkBtn href={`/rfx/${id}/responses`} variant="primary">Go to responses</LinkBtn>} />
      </Card>
    );
  return <CompareGrid rfqId={id} currency={b.rfq.currency} cmp={b.comparison} />;
}
