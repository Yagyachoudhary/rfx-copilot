import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { detectFormat } from "./parsers";
import type { Actor } from "./pipeline";

export type IncomingFile = { name: string; mime: string | null; buf: Buffer; kind: "quote" | "attachment" | "email_body" };

export function defaultCurrencyPolicy(base = "INR") {
  return {
    base,
    policy: "Non-INR quotes are converted at a buyer-set fixed rate. Raw currency is always preserved. No live FX feed in this prototype.",
    rates: {
      USD: {
        rate: Number(process.env.DEMO_FX_USD_INR || 84.2),
        as_of: process.env.DEMO_FX_AS_OF || "2026-10-20",
        source: "Buyer-set fixed rate (demo)",
      },
    },
  };
}

const MIME: Record<string, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  eml: "message/rfc822",
  txt: "text/plain",
  csv: "text/csv",
};
export const mimeFor = (name: string) => MIME[name.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";

/** Create a new response version with its files. The newest version becomes active; older ones are kept. */
export async function createResponse(
  db: SupabaseClient,
  actor: Actor,
  p: { rfqId: string; supplierId: string; channel: string; receivedAt?: string; subject?: string | null; body?: string | null; files: IncomingFile[] },
) {
  if (!p.files.length) throw new Error("At least one file is required");
  for (const f of p.files) {
    if (f.buf.length > 20 * 1024 * 1024) throw new Error(`${f.name} is larger than 20 MB`);
    if (detectFormat(f.name, f.mime) === "unsupported") throw new Error(`${f.name}: unsupported type. Use xlsx, csv, pdf, docx, jpg/png, eml or txt.`);
  }
  const { data: prev } = await db
    .from("supplier_responses")
    .select("id, version, is_active")
    .eq("rfq_id", p.rfqId)
    .eq("supplier_id", p.supplierId)
    .order("version", { ascending: false });
  const version = (prev?.[0]?.version ?? 0) + 1;
  const activePrev = prev?.find((r) => r.is_active);
  if (prev?.length) await db.from("supplier_responses").update({ is_active: false }).eq("rfq_id", p.rfqId).eq("supplier_id", p.supplierId);
  const { data: resp, error } = await db
    .from("supplier_responses")
    .insert({
      org_id: actor.orgId,
      rfq_id: p.rfqId,
      supplier_id: p.supplierId,
      version,
      is_active: true,
      supersedes_id: activePrev?.id ?? null,
      channel: p.channel,
      received_at: p.receivedAt ?? new Date().toISOString(),
      status: "received",
      email_subject: p.subject ?? null,
      email_body: p.body ?? null,
      created_by: actor.userId,
    })
    .select("*")
    .single();
  if (error || !resp) throw new Error(`Could not create response: ${error?.message}`);

  for (const f of p.files) {
    const sha = crypto.createHash("sha256").update(f.buf).digest("hex");
    const safe = f.name.replace(/[^\w.\-]+/g, "_");
    const storagePath = `${actor.orgId}/${p.rfqId}/${resp.id}/${sha.slice(0, 10)}-${safe}`;
    const mime = f.mime || mimeFor(f.name);
    const up = await db.storage.from("source-files").upload(storagePath, f.buf, { contentType: mime, upsert: true });
    if (up.error) throw new Error(`Upload of ${f.name} failed: ${up.error.message}`);
    const { error: fe } = await db.from("source_files").insert({
      org_id: actor.orgId,
      response_id: resp.id,
      storage_path: storagePath,
      file_name: f.name,
      mime_type: mime,
      file_kind: f.kind,
      detected_format: detectFormat(f.name, mime),
      size_bytes: f.buf.length,
      sha256: sha,
      processing_state: "uploaded",
      uploaded_by: actor.userId,
    });
    if (fe) throw new Error(`Saving file record failed: ${fe.message}`);
  }
  await db.from("rfq_suppliers").update({ response_status: "responded", last_response_at: resp.received_at }).eq("rfq_id", p.rfqId).eq("supplier_id", p.supplierId);
  await db.from("audit_events").insert({
    org_id: actor.orgId,
    rfq_id: p.rfqId,
    actor_id: actor.userId,
    actor_email: actor.email,
    action: version > 1 ? "response.new_version" : "response.received",
    entity_type: "supplier_response",
    entity_id: resp.id,
    details: { version, channel: p.channel, files: p.files.map((f) => f.name), supersedes: activePrev?.id ?? null },
  });
  return resp;
}

// ---------------------------------------------------------------------------
// Demo dataset
// ---------------------------------------------------------------------------
export type DemoManifest = {
  buyer_org_name: string;
  rfq: any;
  lines: any[];
  questions: any[];
  suppliers: { key: string; name: string; short_code: string; contact_name: string; email: string; phone: string; location: string }[];
  sample_responses: { supplier: string; version: number; channel: string; received_at: string; email_subject: string | null; email_body: string | null; files: { path: string; kind: IncomingFile["kind"] }[]; is_correction?: boolean }[];
};

export const SAMPLE_ROOT = path.join(process.cwd(), "sample-data");

export function readManifest(): DemoManifest {
  return JSON.parse(fs.readFileSync(path.join(SAMPLE_ROOT, "demo-rfq.json"), "utf8"));
}

export function readSampleFile(rel: string): Buffer {
  const full = path.normalize(path.join(SAMPLE_ROOT, rel));
  if (!full.startsWith(SAMPLE_ROOT)) throw new Error("Invalid sample path");
  return fs.readFileSync(full);
}

/** Seeds suppliers + one demo RFx with 30 lines and a questionnaire. No prices are seeded. */
export async function seedDemo(db: SupabaseClient, actor: Actor) {
  const m = readManifest();
  const { data: existing } = await db.from("suppliers").select("id, name").eq("org_id", actor.orgId);
  const supplierIds: Record<string, string> = {};
  for (const s of m.suppliers) {
    const found = existing?.find((e) => e.name === s.name);
    if (found) {
      supplierIds[s.key] = found.id;
      continue;
    }
    const { data, error } = await db
      .from("suppliers")
      .insert({ org_id: actor.orgId, name: s.name, short_code: s.short_code, contact_name: s.contact_name, email: s.email, phone: s.phone, location: s.location, is_demo: true, notes: "Fictional demo supplier" })
      .select("id")
      .single();
    if (error) throw new Error(`Seeding supplier failed: ${error.message}`);
    supplierIds[s.key] = data.id;
  }
  const { count } = await db.from("rfqs").select("id", { count: "exact", head: true }).eq("org_id", actor.orgId).like("ref_code", `${m.rfq.ref_code}%`);
  const ref = count ? `${m.rfq.ref_code}-${count + 1}` : m.rfq.ref_code;
  const { data: rfq, error } = await db
    .from("rfqs")
    .insert({
      org_id: actor.orgId,
      ref_code: ref,
      title: m.rfq.title,
      description: m.rfq.description,
      category: m.rfq.category,
      status: "collecting",
      currency: m.rfq.currency,
      currency_policy: defaultCurrencyPolicy(m.rfq.currency),
      response_deadline: m.rfq.response_deadline,
      required_by: m.rfq.required_by,
      delivery_location: m.rfq.delivery_location,
      commercial_terms: m.rfq.commercial_terms,
      evaluation_rules: m.rfq.evaluation_rules,
      ai_draft: false,
      is_demo: true,
      created_by: actor.userId,
    })
    .select("*")
    .single();
  if (error || !rfq) throw new Error(`Seeding RFx failed: ${error?.message}`);
  const lineRows = m.lines.map((l) => ({ org_id: actor.orgId, rfq_id: rfq.id, ...l, required_by: m.rfq.required_by }));
  const qRows = m.questions.map((q) => ({ org_id: actor.orgId, rfq_id: rfq.id, ...q }));
  const [a, b] = await Promise.all([db.from("rfq_line_items").insert(lineRows), db.from("rfq_questions").insert(qRows)]);
  if (a.error || b.error) throw new Error(`Seeding lines/questions failed: ${a.error?.message ?? b.error?.message}`);
  const invitedAt = "2026-10-28T10:00:00+05:30";
  const { error: invErr } = await db.from("rfq_suppliers").insert(
    m.suppliers.map((s) => ({
      org_id: actor.orgId,
      rfq_id: rfq.id,
      supplier_id: supplierIds[s.key],
      channel: "email_simulated",
      delivery_status: "delivered",
      response_status: "awaiting",
      invited_at: invitedAt,
      delivered_at: invitedAt,
      message_subject: `${ref}: ${m.rfq.title}`,
      message_body: "Simulated invitation (demo). Please quote against the attached line items and questionnaire.",
    })),
  );
  if (invErr) throw new Error(`Seeding invitations failed: ${invErr.message}`);
  await db.from("audit_events").insert({
    org_id: actor.orgId,
    rfq_id: rfq.id,
    actor_id: actor.userId,
    actor_email: actor.email,
    action: "demo.seeded",
    entity_type: "rfq",
    entity_id: rfq.id,
    details: { suppliers: m.suppliers.length, lines: m.lines.length, note: "Fictional demo data; no prices seeded — quotes come from sample documents via extraction." },
  });
  return { rfqId: rfq.id as string, supplierIds };
}
