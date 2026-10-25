import { NextResponse } from "next/server";
import { getContext } from "@/lib/context";
import { jsonError } from "@/lib/api";

/** Private files are only ever served through short-lived signed URLs after an RLS-checked lookup. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await getContext("api");
    const { data: f } = await ctx.supabase.from("source_files").select("storage_path, file_name").eq("id", id).maybeSingle();
    if (!f) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const inline = new URL(req.url).searchParams.get("inline") === "1";
    const { data, error } = await ctx.supabase.storage.from("source-files").createSignedUrl(f.storage_path, 300, inline ? undefined : { download: f.file_name });
    if (error || !data) throw new Error(error?.message ?? "Could not sign URL");
    if (new URL(req.url).searchParams.get("json") === "1") return NextResponse.json({ url: data.signedUrl });
    return NextResponse.redirect(data.signedUrl);
  } catch (e) {
    return jsonError(e);
  }
}
