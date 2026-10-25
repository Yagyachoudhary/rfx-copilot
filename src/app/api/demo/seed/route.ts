import { NextResponse } from "next/server";
import { getContext } from "@/lib/context";
import { jsonError } from "@/lib/api";
import { seedDemo } from "@/lib/responses";

export async function POST() {
  try {
    const ctx = await getContext("api");
    const r = await seedDemo(ctx.supabase, { orgId: ctx.orgId, userId: ctx.user.id, email: ctx.user.email });
    return NextResponse.json(r);
  } catch (e) {
    return jsonError(e);
  }
}
