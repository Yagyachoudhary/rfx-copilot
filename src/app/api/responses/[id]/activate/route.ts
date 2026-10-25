import { NextResponse } from "next/server";
import { audit, getContext } from "@/lib/context";
import { jsonError } from "@/lib/api";
import { activateVersion, refreshOutliers } from "@/lib/pipeline";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await getContext("api");
    const r = await activateVersion(ctx.supabase, id);
    await refreshOutliers(ctx.supabase, { orgId: ctx.orgId, userId: ctx.user.id, email: ctx.user.email }, r.rfq_id);
    await audit(ctx, "response.version_activated", { rfqId: r.rfq_id, entityType: "supplier_response", entityId: id });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
