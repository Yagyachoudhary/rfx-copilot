import { NextResponse } from "next/server";
import { getContext } from "@/lib/context";
import { jsonError } from "@/lib/api";
import { mimeFor, readSampleFile } from "@/lib/responses";

/** Download a fictional sample document (so a demo user can also drag-and-drop it manually). */
export async function GET(req: Request) {
  try {
    await getContext("api");
    const p = new URL(req.url).searchParams.get("path") ?? "";
    if (!p.startsWith("responses/")) return NextResponse.json({ error: "bad path" }, { status: 400 });
    const buf = readSampleFile(p);
    const name = p.split("/").pop()!;
    return new NextResponse(new Uint8Array(buf), { headers: { "content-type": mimeFor(name), "content-disposition": `attachment; filename="${name}"` } });
  } catch (e) {
    return jsonError(e);
  }
}
