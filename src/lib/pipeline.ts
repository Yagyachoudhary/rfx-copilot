/**
 * Response processing pipeline:
 *   download → parse (file-type specific) → AI extraction (raw values + sources)
 *   → deterministic normalization (with buyer overrides) → exceptions → status.
 * Every run is persisted; raw extraction, normalized values and overrides are stored separately.
 */
import { createClient as createSbClient, type SupabaseClient } from "@supabase/supabase-js";
import { buildExtractionContent, EXTRACTION_VERSION, runExtraction, type ExtractionOutput } from "./ai/extract";
import { MODELS } from "./ai/client";
import { buildOutlierExceptions, buildResponseExceptions } from "./exceptions";
import { normalizeLine, resolveConflicts } from "./normalize";
import { mapExtraction } from "./extraction-map";
import { detectFormat, prepareFile, type PreparedPart } from "./parsers";
import type {
  CurrencyPolicy,
  ExceptionRow,
  ExtractedLine,
  Override,
  QuestionnaireAnswer,
  Rfq,
  RfqLine,
  RfqQuestion,
  SupplierResponse,
} from "./types";

export type Actor = { orgId: string; userId: string; email: string | null };

/** A client bound to the user's JWT — safe to use after the HTTP response has been sent. RLS still applies. */
export function tokenClient(accessToken: string): SupabaseClient {
  return createSbClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function setStatus(db: SupabaseClient, id: string, status: SupplierResponse["status"], detail?: string | null, error?: string | null) {
  await db.from("supplier_responses").update({ status, status_detail: detail ?? null, error: error ?? null }).eq("id", id);
}

async function logAudit(db: SupabaseClient, actor: Actor, action: string, rfqId: string, entityId: string, details: Record<string, any>) {
  await db.from("audit_events").insert({
    org_id: actor.orgId,
    rfq_id: rfqId,
    actor_id: actor.userId,
    actor_email: actor.email,
    action,
    entity_type: "supplier_response",
    entity_id: entityId,
    details,
  });
}

export async function processResponse(db: SupabaseClient, actor: Actor, responseId: string) {
  const { data: resp, error } = await db.from("supplier_responses").select("*").eq("id", responseId).single();
  if (error || !resp) throw new Error(`Response not found: ${error?.message}`);
  const rfqId = resp.rfq_id as string;
  let runId: string | null = null;
  try {
    await setStatus(db, responseId, "parsing", "Reading files");
    const [{ data: rfq }, { data: lines }, { data: questions }, { data: files }] = await Promise.all([
      db.from("rfqs").select("*").eq("id", rfqId).single(),
      db.from("rfq_line_items").select("*").eq("rfq_id", rfqId).order("line_no"),
      db.from("rfq_questions").select("*").eq("rfq_id", rfqId).order("q_no"),
      db.from("source_files").select("*").eq("response_id", responseId).order("created_at"),
    ]);
    if (!rfq || !lines || !files?.length) throw new Error("Missing RFQ, line items or files for this response");

    const parts: PreparedPart[] = [];
    const parserNotes: Record<string, string[]> = {};
    for (const f of files) {
      const { data: blob, error: dlErr } = await db.storage.from("source-files").download(f.storage_path);
      if (dlErr || !blob) throw new Error(`Could not download ${f.file_name}: ${dlErr?.message}`);
      const buf = Buffer.from(await blob.arrayBuffer());
      const fmt = detectFormat(f.file_name, f.mime_type);
      const label = `${f.file_name} (${f.file_kind}, ${fmt})`;
      const part = await prepareFile(buf, f.file_name, fmt, label);
      parts.push(part);
      parserNotes[f.file_name] = part.notes;
      await db.from("source_files").update({ processing_state: "parsed", detected_format: fmt }).eq("id", f.id);
    }

    await setStatus(db, responseId, "extracting", `AI extraction (${MODELS.extraction})`);
    const { data: run } = await db
      .from("extraction_runs")
      .insert({ org_id: actor.orgId, response_id: responseId, model: MODELS.extraction, extraction_version: EXTRACTION_VERSION, parser_notes: parserNotes })
      .select("id")
      .single();
    runId = run?.id ?? null;

    const content = buildExtractionContent({
      rfq: rfq as Rfq,
      lines: lines as RfqLine[],
      questions: (questions ?? []) as RfqQuestion[],
      parts,
      emailMeta: { subject: resp.email_subject, body: resp.email_body, channel: resp.channel },
    });
    const t0 = Date.now();
    const { input: out, usage } = await runExtraction(content);
    await db
      .from("extraction_runs")
      .update({ status: "succeeded", finished_at: new Date().toISOString(), input_tokens: usage.input, output_tokens: usage.output, raw_output: out })
      .eq("id", runId);

    await persistExtraction(db, actor, resp as SupplierResponse, out, runId, lines as RfqLine[], (questions ?? []) as RfqQuestion[], files);
    await setStatus(db, responseId, "normalizing", "Normalizing units, currency and tax");
    const summary = await recomputeResponse(db, actor, responseId);
    await refreshOutliers(db, actor, rfqId);
    await db.from("source_files").update({ processing_state: "extracted" }).eq("response_id", responseId);
    await db
      .from("rfq_suppliers")
      .update({ response_status: "responded", last_response_at: resp.received_at })
      .eq("rfq_id", rfqId)
      .eq("supplier_id", resp.supplier_id);
    if (["sent", "collecting"].includes((rfq as Rfq).status)) await db.from("rfqs").update({ status: "evaluating" }).eq("id", rfqId);
    await logAudit(db, actor, "extraction.completed", rfqId, responseId, {
      run_id: runId,
      model: MODELS.extraction,
      seconds: Math.round((Date.now() - t0) / 1000),
      lines: out.lines?.length ?? 0,
      ...summary,
    });
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    if (runId) await db.from("extraction_runs").update({ status: "failed", finished_at: new Date().toISOString(), error: msg }).eq("id", runId);
    await setStatus(db, responseId, "failed", "Extraction failed — nothing was guessed. Retry or review manually.", msg);
    await db.from("exceptions").upsert(
      {
        org_id: actor.orgId,
        rfq_id: rfqId,
        response_id: responseId,
        supplier_id: resp.supplier_id,
        fingerprint: "extraction_failed",
        type: "extraction_failed",
        severity: "critical",
        title: "Extraction failed",
        explanation: msg,
        suggested_resolution: "Retry processing. If it fails again, request the file in another format or enter values manually.",
        status: "open",
      },
      { onConflict: "response_id,fingerprint" },
    );
    await logAudit(db, actor, "extraction.failed", rfqId, responseId, { error: msg, run_id: runId });
  }
}

export async function persistExtraction(
  db: SupabaseClient,
  actor: Actor,
  resp: SupplierResponse,
  out: ExtractionOutput,
  runId: string | null,
  lines: RfqLine[],
  questions: RfqQuestion[],
  files: any[],
) {
  // Re-extraction replaces previous extracted rows for this response (previous runs keep their raw output).
  await db.from("extracted_quote_lines").delete().eq("response_id", resp.id);
  await db.from("exceptions").delete().eq("response_id", resp.id).eq("status", "open");

  const { extracted: rows, terms, answers } = mapExtraction(out, { orgId: actor.orgId, responseId: resp.id, runId, lines, questions, files });
  if (rows.length) {
    const { error } = await db.from("extracted_quote_lines").insert(rows);
    if (error) throw new Error(`Saving extracted lines failed: ${error.message}`);
  }
  await db.from("supplier_responses").update({ terms }).eq("id", resp.id);

  // Questionnaire answers — claims, never auto-verified.
  if (answers.length) {
    const { error } = await db.from("questionnaire_answers").upsert(answers, { onConflict: "response_id,question_id" });
    if (error) throw new Error(`Saving questionnaire answers failed: ${error.message}`);
  }
}

/** Re-run normalization + exceptions for one response (after extraction, overrides or reviews). */
export async function recomputeResponse(db: SupabaseClient, actor: Actor, responseId: string) {
  const { data: resp } = await db.from("supplier_responses").select("*").eq("id", responseId).single();
  if (!resp) throw new Error("Response not found");
  const [{ data: rfq }, { data: lines }, { data: extracted }, { data: overrides }, { data: questions }, { data: answers }] = await Promise.all([
    db.from("rfqs").select("*").eq("id", resp.rfq_id).single(),
    db.from("rfq_line_items").select("*").eq("rfq_id", resp.rfq_id).order("line_no"),
    db.from("extracted_quote_lines").select("*").eq("response_id", responseId).order("seq"),
    db.from("buyer_overrides").select("*").eq("response_id", responseId).eq("is_active", true),
    db.from("rfq_questions").select("*").eq("rfq_id", resp.rfq_id).order("q_no"),
    db.from("questionnaire_answers").select("*").eq("response_id", responseId),
  ]);
  const r = rfq as Rfq;
  const rfqLines = (lines ?? []) as RfqLine[];
  const ex = (extracted ?? []) as ExtractedLine[];
  const ov = (overrides ?? []) as Override[];
  const policy = (r.currency_policy ?? {}) as CurrencyPolicy;
  const linesById = new Map(rfqLines.map((l) => [l.id, l]));
  let normalized = ex.map((line) =>
    normalizeLine({ line, supplierId: resp.supplier_id, rfqLinesById: linesById, terms: resp.terms ?? {}, policy, baseCurrency: r.currency, overrides: ov }),
  );
  normalized = resolveConflicts(normalized, ex, ov);

  await db.from("normalized_quote_lines").delete().eq("response_id", responseId);
  if (normalized.length) {
    const { error } = await db.from("normalized_quote_lines").insert(normalized.map((n) => ({ ...n, org_id: actor.orgId })));
    if (error) throw new Error(`Saving normalized lines failed: ${error.message}`);
  }

  const exceptions = buildResponseExceptions({
    rfqId: r.id,
    response: resp,
    rfqLines,
    extracted: ex,
    normalized,
    terms: resp.terms ?? {},
    questions: (questions ?? []) as RfqQuestion[],
    answers: (answers ?? []) as QuestionnaireAnswer[],
    baseCurrency: r.currency,
    rfqPaymentDays: parseDays(r.commercial_terms?.payment_terms),
    rfqValidityDays: Number(r.commercial_terms?.validity_days) || null,
  });
  await syncExceptions(db, actor, responseId, exceptions, (fp) => !fp.startsWith("outlier:") && fp !== "extraction_failed");
  // a successful recompute clears a previous failure
  await db.from("exceptions").update({ status: "resolved", resolution_note: "Re-processed successfully", resolved_at: new Date().toISOString() }).eq("response_id", responseId).eq("fingerprint", "extraction_failed").eq("status", "open");

  const { data: open } = await db.from("exceptions").select("severity").eq("response_id", responseId).eq("status", "open");
  const covered = new Set(normalized.filter((n) => n.rfq_line_id && n.status !== "excluded").map((n) => n.rfq_line_id));
  const summary = {
    extracted_lines: ex.length,
    comparable: normalized.filter((n) => n.status === "comparable").length,
    needs_review: normalized.filter((n) => n.status === "needs_review").length,
    excluded: normalized.filter((n) => n.status === "excluded").length,
    covered_lines: covered.size,
    total_lines: rfqLines.length,
    open_critical: (open ?? []).filter((o) => o.severity === "critical").length,
    open_warning: (open ?? []).filter((o) => o.severity === "warning").length,
  };
  const status = summary.open_critical + summary.open_warning > 0 || summary.needs_review > 0 ? "needs_review" : "ready";
  await db.from("supplier_responses").update({ summary, status, status_detail: null, error: null }).eq("id", responseId);
  return summary;
}

function parseDays(s: any): number | null {
  const m = String(s ?? "").match(/(\d+)\s*day/i);
  return m ? Number(m[1]) : null;
}

/** Upsert exceptions by fingerprint; preserve buyer resolutions; auto-resolve ones whose condition disappeared. */
async function syncExceptions(db: SupabaseClient, actor: Actor, responseId: string, fresh: ExceptionRow[], managed: (fp: string) => boolean) {
  const { data: existing } = await db.from("exceptions").select("id, fingerprint, status").eq("response_id", responseId);
  const exMap = new Map((existing ?? []).map((e) => [e.fingerprint, e]));
  const freshFps = new Set(fresh.map((f) => f.fingerprint));
  const upserts = fresh.map((f) => {
    const prev = exMap.get(f.fingerprint);
    return { ...f, org_id: actor.orgId, status: prev?.status ?? "open" };
  });
  if (upserts.length) {
    const { error } = await db.from("exceptions").upsert(upserts, { onConflict: "response_id,fingerprint" });
    if (error) throw new Error(`Saving exceptions failed: ${error.message}`);
  }
  const stale = (existing ?? []).filter((e) => managed(e.fingerprint) && !freshFps.has(e.fingerprint) && e.status === "open");
  if (stale.length) {
    await db
      .from("exceptions")
      .update({ status: "resolved", resolution_note: "Auto-resolved: the condition no longer applies after correction/re-processing", resolved_at: new Date().toISOString() })
      .in(
        "id",
        stale.map((s) => s.id),
      );
  }
}

/** Cross-supplier outlier check over active responses (catches decimal typos and basis errors). */
export async function refreshOutliers(db: SupabaseClient, actor: Actor, rfqId: string) {
  const { data: active } = await db.from("supplier_responses").select("id, supplier_id").eq("rfq_id", rfqId).eq("is_active", true);
  const ids = (active ?? []).map((a) => a.id);
  if (!ids.length) return;
  const [{ data: rows }, { data: lines }] = await Promise.all([
    db.from("normalized_quote_lines").select("response_id, supplier_id, rfq_line_id, extracted_line_id, unit_price_base, status").in("response_id", ids).eq("status", "comparable"),
    db.from("rfq_line_items").select("id, line_no").eq("rfq_id", rfqId),
  ]);
  const lineNo = new Map((lines ?? []).map((l) => [l.id, l.line_no]));
  const fresh = buildOutlierExceptions(
    rfqId,
    (rows ?? [])
      .filter((r) => r.rfq_line_id && r.unit_price_base)
      .map((r) => ({ ...r, unit_price_base: Number(r.unit_price_base), line_no: lineNo.get(r.rfq_line_id) ?? 0 })),
  );
  for (const id of ids) {
    const mine = fresh.filter((f) => f.response_id === id);
    await syncExceptions(db, actor, id, mine, (fp) => fp.startsWith("outlier:"));
  }
}

/** Activate a response version (corrected submissions keep history; exactly one active per supplier). */
export async function activateVersion(db: SupabaseClient, responseId: string) {
  const { data: resp } = await db.from("supplier_responses").select("id, rfq_id, supplier_id").eq("id", responseId).single();
  if (!resp) throw new Error("Response not found");
  await db.from("supplier_responses").update({ is_active: false }).eq("rfq_id", resp.rfq_id).eq("supplier_id", resp.supplier_id);
  await db.from("supplier_responses").update({ is_active: true }).eq("id", responseId);
  return resp;
}
