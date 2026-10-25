import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { jsonError } from "@/lib/api";
import { seedDemo } from "@/lib/responses";

export async function POST(req: Request) {
  try {
    const sb = await createClient();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    const body = await req.json();
    const name = String(body.name ?? "").trim() || "My workspace";
    const { data: orgId, error } = await sb.rpc("create_organization", { p_name: name, p_full_name: body.fullName || null });
    if (error) throw new Error(`Could not create workspace: ${error.message}. Did you run supabase/migrations/0001_schema.sql?`);
    let rfqId: string | null = null;
    if (body.seed) {
      const r = await seedDemo(sb, { orgId: orgId as string, userId: user.id, email: user.email ?? null });
      rfqId = r.rfqId;
    }
    return NextResponse.json({ orgId, rfqId });
  } catch (e) {
    return jsonError(e);
  }
}
