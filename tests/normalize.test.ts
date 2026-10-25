import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeLine, resolveConflicts } from "../src/lib/normalize";
import { buildComparison, computeScenario } from "../src/lib/compare";
import { buildResponseExceptions } from "../src/lib/exceptions";
import type { ExtractedLine, Override, RfqLine, Supplier, SupplierResponse } from "../src/lib/types";

const L = (n: number, uom = "pcs", qty = 1000): RfqLine => ({ id: `l${n}`, rfq_id: "r", line_no: n, description: `Line ${n}`, specification: null, quantity: qty, uom, category: null, required_by: null });
const lines = [L(1), L(2), L(3, "rolls", 100), L(4, "kg", 500)];
const byId = new Map(lines.map((l) => [l.id, l]));
const policy = { rates: { USD: { rate: 84.2, as_of: "2026-10-20", source: "test" } } };
let seq = 0;
const ex = (p: Partial<ExtractedLine>): ExtractedLine => ({
  id: `e${++seq}`, response_id: "resp", run_id: null, source_file_id: null, seq, raw_text: "x", raw_description: "x", raw_item_code: null,
  mapped_line_id: "l1", mapping_confidence: "high", mapping_candidates: [], mapping_rationale: null, raw_quantity: null, raw_uom: "pc",
  raw_unit_price: 10, raw_currency: "INR", raw_price_basis: "per_unit", raw_basis_quantity: null, pack_size_evidence: null, raw_extended_price: null,
  raw_tax_note: null, lead_time_text: null, notes: null, confidence: "high", legibility: "clear", source_location: { page: 1 }, source_snippet: "snip", flags: [], ...p,
});
const norm = (line: ExtractedLine, terms: any = { tax_treatment: "exclusive", currency: "INR" }, overrides: Override[] = []) =>
  normalizeLine({ line, supplierId: "s1", rfqLinesById: byId, terms, policy, baseCurrency: "INR", overrides });

test("per unit INR exclusive is comparable as-is", () => {
  const n = norm(ex({ raw_unit_price: 9.5 }));
  assert.equal(n.status, "comparable");
  assert.equal(n.unit_price_base, 9.5);
  assert.equal(n.extended_price_base, 9500);
});

test("per 100 Nos divides by 100", () => {
  const n = norm(ex({ raw_unit_price: 540, raw_price_basis: "per_n_units", raw_basis_quantity: 100, raw_uom: "Nos" }));
  assert.equal(n.status, "comparable");
  assert.equal(n.unit_price_base, 5.4);
});

test("per box with pack-size evidence converts; without evidence it does not", () => {
  const ok = norm(ex({ mapped_line_id: "l3", raw_uom: "box", raw_unit_price: 36, raw_price_basis: "per_pack", raw_basis_quantity: 36, pack_size_evidence: "each box contains 36 rolls" }));
  assert.equal(ok.status, "comparable");
  assert.equal(ok.unit_price_base, 1);
  const no = norm(ex({ mapped_line_id: "l3", raw_uom: "box", raw_unit_price: 64, raw_price_basis: "per_pack", raw_basis_quantity: null }));
  assert.equal(no.status, "needs_review");
  assert.match(no.status_reason!, /pack size/);
  assert.equal(no.unit_price_base, null);
});

test("buyer-confirmed pack size via override makes it comparable and keeps raw", () => {
  const line = ex({ mapped_line_id: "l3", raw_uom: "box", raw_unit_price: 64, raw_price_basis: "per_pack" });
  const ov: Override[] = [{ id: "o1", response_id: "resp", extracted_line_id: line.id, field: "raw_basis_quantity", original_value: null, new_value: 24, reason: "phone", is_active: true, user_email: "b@x", created_at: "2026-01-01" }];
  const n = norm(line, undefined, ov);
  assert.equal(n.status, "comparable");
  assert.equal(n.unit_price_base, 2.6667);
  assert.equal(n.has_override, true);
  assert.equal(line.raw_basis_quantity, null);
});

test("per kg for a per-piece line needs review (no weight evidence)", () => {
  const n = norm(ex({ raw_unit_price: 42, raw_price_basis: "per_kg", raw_uom: "kg" }));
  assert.equal(n.status, "needs_review");
  assert.match(n.status_reason!, /per kg/);
});

test("per kg on a kg line is fine", () => {
  const n = norm(ex({ mapped_line_id: "l4", raw_unit_price: 170, raw_price_basis: "per_kg", raw_uom: "kg" }));
  assert.equal(n.status, "comparable");
});

test("USD converts with explicit rate, date and source", () => {
  const n = norm(ex({ raw_unit_price: 0.1, raw_currency: "USD" }), { tax_treatment: "exclusive", currency: "USD" });
  assert.equal(n.status, "comparable");
  assert.equal(n.fx_rate, 84.2);
  assert.equal(n.unit_price_base, 8.42);
  assert.ok(n.rules_applied.some((r) => r.includes("USD→INR @ 84.2")));
});

test("unknown currency rate is not guessed", () => {
  const n = norm(ex({ raw_currency: "EUR" }));
  assert.equal(n.status, "needs_review");
});

test("GST-inclusive prices are converted to ex-GST only when the rate is stated", () => {
  const n = norm(ex({ raw_unit_price: 11.8 }), { tax_treatment: "inclusive", tax_rate_percent: 18, currency: "INR" });
  assert.equal(n.unit_price_base, 10);
  const u = norm(ex({ raw_unit_price: 11.8 }), { tax_treatment: "inclusive", currency: "INR" });
  assert.equal(u.status, "needs_review");
});

test("low-confidence mapping is not forced", () => {
  const n = norm(ex({ mapped_line_id: "l1", mapping_confidence: "low", mapping_candidates: [{ line_no: 1 }, { line_no: 2 }] }));
  assert.equal(n.status, "needs_review");
  assert.equal(n.rfq_line_id, null);
});

test("unreadable price stays null — never zero", () => {
  const n = norm(ex({ raw_unit_price: null, legibility: "unreadable" }));
  assert.equal(n.status, "needs_review");
  assert.equal(n.unit_price_base, null);
  assert.match(n.status_reason!, /unreadable/);
});

test("conflicting duplicate prices block comparison until buyer chooses", () => {
  const a = ex({ raw_unit_price: 41.5 });
  const b = ex({ raw_unit_price: 39.8 });
  const rows = resolveConflicts([norm(a), norm(b)], [a, b], []);
  assert.ok(rows.every((r) => r.status === "needs_review"));
  const ov: Override[] = [{ id: "o", response_id: "resp", extracted_line_id: b.id, field: "choose_in_conflict", original_value: null, new_value: true, reason: "rev", is_active: true, user_email: null, created_at: "x" }];
  const rows2 = resolveConflicts([norm(a, undefined, ov), norm(b, undefined, ov)], [a, b], ov);
  assert.equal(rows2.find((r) => r.extracted_line_id === b.id)!.status, "comparable");
  assert.equal(rows2.find((r) => r.extracted_line_id === a.id)!.status, "excluded");
});

test("comparison + scenario: missing lines are never zero; unknown freight marks total incomplete", () => {
  const sups: Supplier[] = [
    { id: "s1", name: "A", short_code: null, contact_name: null, email: null, phone: null, location: null, is_demo: true },
    { id: "s2", name: "B", short_code: null, contact_name: null, email: null, phone: null, location: null, is_demo: true },
  ];
  const resp = (id: string, sid: string, freight: any): SupplierResponse => ({ id, rfq_id: "r", supplier_id: sid, version: 1, is_active: true, supersedes_id: null, channel: "email", received_at: "", status: "ready", status_detail: null, error: null, terms: { freight, tax_treatment: "exclusive" }, summary: {}, email_subject: null, email_body: null, created_at: "" });
  const r1 = resp("p1", "s1", { type: "included" });
  const r2 = resp("p2", "s2", { type: "extra_unquantified" });
  const e1 = ex({ response_id: "p1", mapped_line_id: "l1", raw_unit_price: 10 });
  const e2 = ex({ response_id: "p1", mapped_line_id: "l2", raw_unit_price: 20 });
  const e3 = ex({ response_id: "p2", mapped_line_id: "l1", raw_unit_price: 9 });
  const n = [e1, e2].map((e) => ({ ...norm(e), response_id: "p1", supplier_id: "s1" })).concat([{ ...norm(e3), response_id: "p2", supplier_id: "s2" }]);
  const cmp = buildComparison({ lines, suppliers: sups, responses: [r1, r2], normalized: n, extracted: [e1, e2, e3], exceptions: [], questions: [], answers: [] });
  assert.equal(cmp.cells["l2"]["s2"].state, "missing");
  assert.equal(cmp.cells["l2"]["s2"].unitPrice, null);
  assert.equal(cmp.bestByLine["l1"]!.supplierId, "s2");
  const sc = computeScenario(cmp, { mode: "split_cheapest", onlyQualified: false, requireVerified: false, includeFreight: true, applyConditionalDiscounts: false, excludeFlagged: false });
  assert.equal(sc.awards.length, 2);
  assert.equal(sc.unpricedLines.length, 2); // l3, l4 not quoted by anyone
  assert.equal(sc.totalIsComplete, false);
  assert.equal(sc.bySupplier.find((b) => b.supplierId === "s2")!.freight, null);
  const single = computeScenario(cmp, { mode: "single_supplier", supplierId: "s2", onlyQualified: false, requireVerified: false, includeFreight: false, applyConditionalDiscounts: false, excludeFlagged: false });
  assert.equal(single.subtotal, 9000);
  assert.ok(single.unpricedLines.some((u) => u.lineNo === 2));
});

test("exceptions: coverage gap and unresolved references are explicit", () => {
  const e1 = ex({ mapped_line_id: "l1" });
  const out = buildResponseExceptions({
    rfqId: "r",
    response: { id: "resp", supplier_id: "s1" },
    rfqLines: lines,
    extracted: [e1],
    normalized: [norm(e1)],
    terms: { tax_treatment: "exclusive", freight: { type: "extra_unquantified", text: "freight extra" }, unresolved_references: [{ text: "rest same as last year" }] },
    questions: [],
    answers: [],
    baseCurrency: "INR",
  });
  const cov = out.find((e) => e.type === "coverage_gap")!;
  assert.match(cov.title, /Quoted 1 of 4/);
  assert.ok(out.some((e) => e.type === "unresolved_reference" && e.severity === "critical"));
  assert.ok(out.some((e) => e.type === "freight_unquantified"));
});
