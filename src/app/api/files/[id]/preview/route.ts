import { NextResponse } from "next/server";
import { getContext } from "@/lib/context";
import { jsonError } from "@/lib/api";
import { detectFormat, docxParagraphs, xlsxGrid } from "@/lib/parsers";

/** Renders a source file for the side-by-side viewer, using the same coordinates the extractor saw. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await getContext("api");
    const { data: f } = await ctx.supabase.from("source_files").select("storage_path, file_name, mime_type").eq("id", id).maybeSingle();
    if (!f) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const fmt = detectFormat(f.file_name, f.mime_type);
    if (fmt === "pdf" || fmt === "image") {
      const { data } = await ctx.supabase.storage.from("source-files").createSignedUrl(f.storage_path, 600);
      return NextResponse.json({ kind: fmt, url: data?.signedUrl });
    }
    const { data: blob, error } = await ctx.supabase.storage.from("source-files").download(f.storage_path);
    if (error || !blob) throw new Error(error?.message ?? "download failed");
    const buf = Buffer.from(await blob.arrayBuffer());
    if (fmt === "xlsx") return NextResponse.json({ kind: "sheet", sheets: await xlsxGrid(buf) });
    if (fmt === "docx") return NextResponse.json({ kind: "doc", paragraphs: await docxParagraphs(buf) });
    const text = buf.toString("utf8").replace(/=\r?\n/g, "");
    return NextResponse.json({ kind: "lines", lines: text.split(/\r?\n/) });
  } catch (e) {
    return jsonError(e);
  }
}
