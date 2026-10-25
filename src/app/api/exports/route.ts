import { NextResponse } from "next/server";
import { getContext } from "@/lib/context";
import { jsonError } from "@/lib/api";

export async function GET(req: Request) {
  try {
    const ctx = await getContext("api");
    const path = new URL(req.url).searchParams.get("path") ?? "";
    if (!path.startsWith(`${ctx.orgId}/`)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const seg = path.split("/").pop()!;
    const name = seg.includes("Z-") ? seg.slice(seg.indexOf("Z-") + 2) : seg;
    const { data, error } = await ctx.supabase.storage.from("exports").createSignedUrl(path, 300, { download: name });
    if (error || !data) throw new Error(error?.message ?? "Could not sign");
    return NextResponse.redirect(data.signedUrl);
  } catch (e) {
    return jsonError(e);
  }
}
