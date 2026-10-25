import { NextResponse } from "next/server";
import { audit, getContext } from "@/lib/context";
import { jsonError } from "@/lib/api";
import { proposeTheme } from "@/lib/ai/theme";

export const maxDuration = 90;

export async function POST(req: Request) {
  try {
    const ctx = await getContext("api");
    if (ctx.role !== "admin") return NextResponse.json({ error: "Admins only" }, { status: 403 });
    const fd = await req.formData();
    const f = fd.get("file");
    if (!f || typeof f === "string") return NextResponse.json({ error: "Upload an image" }, { status: 400 });
    if (f.size > 10 * 1024 * 1024) return NextResponse.json({ error: "Image larger than 10 MB" }, { status: 400 });
    const buf = Buffer.from(await f.arrayBuffer());
    const sourcePath = `${ctx.orgId}/theme-sources/${Date.now()}-${f.name.replace(/[^\w.\-]+/g, "_")}`;
    await ctx.supabase.storage.from("branding").upload(sourcePath, buf, { contentType: f.type || "image/png" });
    const { input, palette } = await proposeTheme(buf);
    await audit(ctx, "theme.proposed", { entityType: "organization_theme", details: { source: sourcePath, warnings: input.warnings } });
    return NextResponse.json({ ...input, palette, sourcePath });
  } catch (e) {
    return jsonError(e);
  }
}
