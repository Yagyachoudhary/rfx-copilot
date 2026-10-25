import { NextResponse } from "next/server";
import { getContext } from "@/lib/context";
import { jsonError } from "@/lib/api";
import { createResponse, mimeFor, readManifest, readSampleFile, type IncomingFile } from "@/lib/responses";
import { startProcessing } from "@/lib/processing";

export const maxDuration = 300;

/** Add a supplier response: multipart upload of real files, or { sample: n } to replay a demo document. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: rfqId } = await params;
    const ctx = await getContext("api");
    const actor = { orgId: ctx.orgId, userId: ctx.user.id, email: ctx.user.email };
    const ct = req.headers.get("content-type") ?? "";
    let resp;
    if (ct.includes("application/json")) {
      const { sample, process = true } = await req.json();
      const m = readManifest();
      const s = m.sample_responses[Number(sample)];
      if (!s) return NextResponse.json({ error: "Unknown sample" }, { status: 400 });
      const supplierMeta = m.suppliers.find((x) => x.key === s.supplier)!;
      const { data: sup } = await ctx.supabase.from("suppliers").select("id").eq("name", supplierMeta.name).maybeSingle();
      if (!sup) return NextResponse.json({ error: `Supplier ${supplierMeta.name} is not in this workspace` }, { status: 400 });
      const files: IncomingFile[] = s.files.map((f) => ({ name: f.path.split("/").pop()!, mime: mimeFor(f.path), buf: readSampleFile(f.path), kind: f.kind }));
      resp = await createResponse(ctx.supabase, actor, { rfqId, supplierId: sup.id, channel: s.channel, receivedAt: s.received_at, subject: s.email_subject, body: s.email_body, files });
      if (process) await startProcessing(ctx, resp.id);
    } else {
      const form = await req.formData();
      const supplierId = String(form.get("supplierId") ?? "");
      if (!supplierId) return NextResponse.json({ error: "supplierId required" }, { status: 400 });
      const uploads = form.getAll("files").filter((f): f is File => typeof f !== "string");
      const kinds = form.getAll("kinds").map(String);
      const files: IncomingFile[] = await Promise.all(
        uploads.map(async (f, i) => ({ name: f.name, mime: f.type || mimeFor(f.name), buf: Buffer.from(await f.arrayBuffer()), kind: (kinds[i] as any) || (i === 0 ? "quote" : "attachment") })),
      );
      const bodyText = String(form.get("body") ?? "").trim();
      if (!files.length && bodyText) {
        files.push({ name: "email-body.txt", mime: "text/plain", buf: Buffer.from(bodyText, "utf8"), kind: "email_body" });
      }
      resp = await createResponse(ctx.supabase, actor, {
        rfqId,
        supplierId,
        channel: String(form.get("channel") ?? "email"),
        subject: String(form.get("subject") ?? "") || null,
        body: files.some((f) => f.kind === "email_body") ? null : bodyText || null,
        files,
      });
      await startProcessing(ctx, resp.id);
    }
    return NextResponse.json({ responseId: resp.id, version: resp.version });
  } catch (e) {
    return jsonError(e);
  }
}
