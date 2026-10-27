import { NextResponse } from "next/server";
import { audit, getContext } from "@/lib/context";
import { jsonError } from "@/lib/api";
import { activateVersion, refreshOutliers } from "@/lib/pipeline";

/**
 * Remove one supplier reply (this version and its files). If it was the version in use, the previous
 * version from the same supplier becomes active again; if none is left, the supplier goes back to "awaiting".
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await getContext("api");
    if (ctx.role === "viewer") return NextResponse.json({ error: "Viewers can't remove replies." }, { status: 403 });
    const db = ctx.supabase;
    const { data: resp } = await db.from("supplier_responses").select("id, rfq_id, supplier_id, version, is_active").eq("id", id).maybeSingle();
    if (!resp) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const { data: files } = await db.from("source_files").select("file_name").eq("response_id", id);

    await db.from("supplier_responses").update({ supersedes_id: null }).eq("supersedes_id", id);
    const { error } = await db.from("supplier_responses").delete().eq("id", id);
    if (error) throw new Error(error.message);

    const { data: rest } = await db
      .from("supplier_responses")
      .select("id, is_active, received_at")
      .eq("rfq_id", resp.rfq_id)
      .eq("supplier_id", resp.supplier_id)
      .order("version", { ascending: false });
    if (resp.is_active && rest?.length) await activateVersion(db, rest[0].id);
    if (!rest?.length) {
      await db.from("rfq_suppliers").update({ response_status: "awaiting", last_response_at: null }).eq("rfq_id", resp.rfq_id).eq("supplier_id", resp.supplier_id);
    }
    await refreshOutliers(db, { orgId: ctx.orgId, userId: ctx.user.id, email: ctx.user.email }, resp.rfq_id);
    await audit(ctx, "response.deleted", {
      rfqId: resp.rfq_id,
      entityType: "supplier_response",
      entityId: id,
      details: { supplier_id: resp.supplier_id, version: resp.version, files: (files ?? []).map((f) => f.file_name), restored_previous: Boolean(resp.is_active && rest?.length) },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
