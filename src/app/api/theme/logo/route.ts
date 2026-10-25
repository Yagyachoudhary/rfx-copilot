import { NextResponse } from "next/server";
import { getContext } from "@/lib/context";
import { jsonError } from "@/lib/api";

export async function POST(req: Request) {
  try {
    const ctx = await getContext("api");
    if (ctx.role !== "admin") return NextResponse.json({ error: "Admins only" }, { status: 403 });
    const fd = await req.formData();
    const f = fd.get("file");
    if (!f || typeof f === "string") return NextResponse.json({ error: "Upload an image" }, { status: 400 });
    if (f.size > 2 * 1024 * 1024) return NextResponse.json({ error: "Logo larger than 2 MB" }, { status: 400 });
    const path = `${ctx.orgId}/logo-${Date.now()}-${f.name.replace(/[^\w.\-]+/g, "_")}`;
    const { error } = await ctx.supabase.storage.from("branding").upload(path, Buffer.from(await f.arrayBuffer()), { contentType: f.type || "image/png" });
    if (error) throw new Error(error.message);
    const { data } = await ctx.supabase.storage.from("branding").createSignedUrl(path, 3600);
    return NextResponse.json({ path, url: data?.signedUrl });
  } catch (e) {
    return jsonError(e);
  }
}
