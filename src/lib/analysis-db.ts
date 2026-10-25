/**
 * The analyst agent answers by running read-only SQL over an in-memory SQLite snapshot
 * of the CURRENT RFx state (active responses, normalized values incl. buyer overrides,
 * questionnaire, exceptions). Tenant isolation is enforced upstream: the snapshot is built
 * from rows the signed-in user can read under RLS.
 */
import fs from "node:fs";
import path from "node:path";
import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";
import { sourceRefLabel } from "./compare";
import type { RfqBundle } from "./data";
import { meetsRule } from "./qualification";

let SQL: SqlJsStatic | null = null;
async function sql() {
  if (!SQL) {
    const wasmPath = path.join(process.cwd(), "node_modules", "sql.js", "dist", "sql-wasm.wasm");
    const wasmBinary = fs.readFileSync(wasmPath);
    SQL = await initSqlJs({ wasmBinary: new Uint8Array(wasmBinary).buffer as ArrayBuffer });
  }
  return SQL;
}

export const ANALYST_SCHEMA = `
suppliers(supplier, response_version, coverage_lines, comparable_lines, review_lines, missing_lines_list, comparable_total_inr,
          qualification, qualification_detail, quote_currency, tax_treatment, freight_type, freight_percent, freight_text,
          payment_terms, payment_days, validity_days, lead_time_days, discounts_text, open_critical, open_warning)
line_items(line_no, description, specification, quantity, uom, category)
quotes(supplier, line_no, state, comparable, unit_price_inr, extended_inr, raw_price, raw_currency, raw_basis, raw_basis_qty, raw_uom,
       raw_description, fx_rate, fx_as_of, tax_treatment, rules_applied, status_reason, confidence, low_confidence, outlier,
       has_override, source_file, source_ref, source_snippet)
   -- one row per (supplier, RFQ line) for suppliers with an active response. state: comparable | needs_review | missing | conflict.
   -- unit_price_inr / extended_inr are NULL unless comparable = 1. Missing quotes are rows with state='missing' (never zero).
questionnaire(supplier, q_no, question, must_pass, answer_type, raw_answer, answer_bool, answer_number, meets_requirement, evidence_type, review_status, evidence_snippet, source_ref)
   -- meets_requirement: 1 / 0 / NULL (cannot evaluate). review_status: unverified | verified | rejected | missing
exceptions(supplier, line_no, type, severity, status, title, explanation, suggested_resolution)
`.trim();

export async function buildAnalysisDb(b: RfqBundle): Promise<Database> {
  const S = await sql();
  const db = new S.Database();
  db.run(`
    CREATE TABLE suppliers(supplier TEXT, response_version INT, coverage_lines INT, comparable_lines INT, review_lines INT, missing_lines_list TEXT,
      comparable_total_inr REAL, qualification TEXT, qualification_detail TEXT, quote_currency TEXT, tax_treatment TEXT, freight_type TEXT,
      freight_percent REAL, freight_text TEXT, payment_terms TEXT, payment_days INT, validity_days INT, lead_time_days INT, discounts_text TEXT,
      open_critical INT, open_warning INT);
    CREATE TABLE line_items(line_no INT, description TEXT, specification TEXT, quantity REAL, uom TEXT, category TEXT);
    CREATE TABLE quotes(supplier TEXT, line_no INT, state TEXT, comparable INT, unit_price_inr REAL, extended_inr REAL, raw_price REAL,
      raw_currency TEXT, raw_basis TEXT, raw_basis_qty REAL, raw_uom TEXT, raw_description TEXT, fx_rate REAL, fx_as_of TEXT, tax_treatment TEXT,
      rules_applied TEXT, status_reason TEXT, confidence TEXT, low_confidence INT, outlier INT, has_override INT, source_file TEXT, source_ref TEXT, source_snippet TEXT);
    CREATE TABLE questionnaire(supplier TEXT, q_no INT, question TEXT, must_pass INT, answer_type TEXT, raw_answer TEXT, answer_bool INT,
      answer_number REAL, meets_requirement INT, evidence_type TEXT, review_status TEXT, evidence_snippet TEXT, source_ref TEXT);
    CREATE TABLE exceptions(supplier TEXT, line_no INT, type TEXT, severity TEXT, status TEXT, title TEXT, explanation TEXT, suggested_resolution TEXT);
  `);
  const cmp = b.comparison;
  const fileName = new Map(b.files.map((f) => [f.id, f.file_name]));
  const ins = (table: string, row: any[]) => db.run(`INSERT INTO ${table} VALUES (${row.map(() => "?").join(",")})`, row.map((v) => (v === undefined ? null : v)));
  for (const l of b.lines) ins("line_items", [l.line_no, l.description, l.specification, Number(l.quantity), l.uom, l.category]);
  const supplierName = new Map(b.suppliers.map((s) => [s.id, s.name]));
  for (const s of cmp.suppliers) {
    if (!s.response) continue;
    const t = s.terms;
    ins("suppliers", [
      s.supplier.name, s.response.version, s.coverage, s.comparableCount, s.reviewCount, s.missingLines.map((n) => `L${n}`).join(", "),
      s.comparableTotal, s.qualification.status, s.qualification.label, t.currency ?? null, t.tax_treatment ?? null, t.freight?.type ?? null,
      t.freight?.percent ?? null, t.freight?.text ?? null, t.payment_terms ?? null, t.payment_days ?? null, t.validity_days ?? null, t.lead_time_days ?? null,
      (t.discounts ?? []).map((d) => `${d.description}${d.conditional ? " (conditional)" : ""}`).join("; ") || null,
      s.openExceptions.critical, s.openExceptions.warning,
    ]);
    for (const l of b.lines) {
      const c = cmp.cells[l.id][s.supplier.id];
      const ex = c.extractedLineId ? b.extracted.find((e) => e.id === c.extractedLineId) : undefined;
      const n = c.extractedLineId ? b.normalized.find((x) => x.extracted_line_id === c.extractedLineId) : undefined;
      ins("quotes", [
        s.supplier.name, l.line_no, c.state, c.state === "comparable" ? 1 : 0, c.unitPrice, c.extended, c.raw?.price ?? null, c.raw?.currency ?? null,
        c.raw?.basis ?? null, c.raw?.basisQty ?? null, c.raw?.uom ?? null, c.raw?.description ?? null, c.fx?.rate ?? null, c.fx?.asOf ?? null,
        n?.tax_treatment ?? null, c.rules.join("; ") || null, c.reason, c.confidence, c.flags.includes("low_confidence") ? 1 : 0, c.flags.includes("outlier") ? 1 : 0,
        c.hasOverride ? 1 : 0, ex?.source_file_id ? fileName.get(ex.source_file_id) ?? null : null,
        ex ? sourceRefLabel(ex.source_location, null) : null, ex?.source_snippet ?? null,
      ]);
    }
    const qa = b.answers.filter((a) => a.response_id === s.response!.id);
    for (const q of b.questions) {
      const a = qa.find((x) => x.question_id === q.id);
      const m = meetsRule(q, a);
      ins("questionnaire", [
        s.supplier.name, q.q_no, q.question, q.must_pass ? 1 : 0, q.answer_type, a?.raw_answer ?? null,
        a?.normalized_value?.bool === undefined || a?.normalized_value?.bool === null ? null : a.normalized_value.bool ? 1 : 0,
        a?.normalized_value?.number ?? null, m === null ? null : m ? 1 : 0, a?.evidence_type ?? null, a?.review_status ?? "missing",
        a?.evidence_snippet ?? null, a ? sourceRefLabel(a.source_location, null) : null,
      ]);
    }
  }
  const lineNo = new Map(b.lines.map((l) => [l.id, l.line_no]));
  for (const e of b.exceptions) {
    ins("exceptions", [e.supplier_id ? supplierName.get(e.supplier_id) ?? null : null, e.rfq_line_id ? lineNo.get(e.rfq_line_id) ?? null : null, e.type, e.severity, e.status, e.title, e.explanation, e.suggested_resolution]);
  }
  return db;
}

const FORBIDDEN = /\b(insert|update|delete|drop|alter|create|attach|detach|pragma|replace|vacuum|reindex|trigger)\b/i;

export function runReadOnly(db: Database, query: string, limit = 200): { columns: string[]; rows: any[][]; truncated: boolean } {
  const q = query.trim().replace(/;+\s*$/, "");
  if (!/^(select|with)\b/i.test(q)) throw new Error("Only SELECT / WITH queries are allowed.");
  if (q.includes(";")) throw new Error("One statement at a time.");
  if (FORBIDDEN.test(q)) throw new Error("Query contains a forbidden keyword.");
  const res = db.exec(q);
  if (!res.length) return { columns: [], rows: [], truncated: false };
  const { columns, values } = res[0];
  const rows = values.slice(0, limit).map((r) => r.map((v) => (typeof v === "number" ? Math.round(v * 10000) / 10000 : v)));
  return { columns, rows, truncated: values.length > limit };
}
