import { NextResponse } from "next/server";
import { audit, getContext } from "@/lib/context";
import { jsonError } from "@/lib/api";

export async function POST(req: Request) {
  try {
    const ctx = await getContext("api");
    const b = await req.json();
    if (!b.name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });
    const { data, error } = await ctx.supabase
      .from("suppliers")
      .insert({ org_id: ctx.orgId, name: b.name.trim(), contact_name: b.contact_name || null, email: b.email || null, phone: b.phone || null, location: b.location || null })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await audit(ctx, "supplier.created", { entityType: "supplier", entityId: data.id, details: { name: b.name } });
    return NextResponse.json({ id: data.id });
  } catch (e) {
    return jsonError(e);
  }
}
