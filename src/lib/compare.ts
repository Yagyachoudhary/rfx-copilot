/**
 * Builds the side-by-side comparison and award scenarios from persisted records.
 * Pure functions: the same code feeds the comparison grid, the decision workspace,
 * the exports and the analyst's SQL tables, so every screen agrees.
 */
import { qualify, type Qualification } from "./qualification";
import type {
  ExceptionRow,
  ExtractedLine,
  NormalizedLine,
  QuestionnaireAnswer,
  ResponseTerms,
  RfqLine,
  RfqQuestion,
  Supplier,
  SupplierResponse,
} from "./types";

export type CellState = "comparable" | "needs_review" | "missing" | "conflict" | "no_response";

export type Cell = {
  state: CellState;
  unitPrice: number | null; // normalized, base currency, ex-tax, per requested UOM
  extended: number | null;
  raw: { price: number | null; currency: string | null; basis: string | null; basisQty: number | null; uom: string | null; description: string | null } | null;
  reason: string | null;
  rules: string[];
  hasOverride: boolean;
  confidence: string | null;
  extractedLineId: string | null;
  fx: { rate: number; asOf: string | null; source: string | null; currency: string } | null;
  flags: string[]; // 'low_confidence' | 'outlier' | 'tax_assumed' | 'no_source'
  source: { snippet: string | null; ref: string | null } | null;
};

export type SupplierSummary = {
  supplier: Supplier;
  response: SupplierResponse | null;
  coverage: number; // lines with any quote (comparable or needing review)
  comparableCount: number;
  reviewCount: number;
  missingLines: number[];
  comparableTotal: number; // sum of extended for comparable lines only
  openExceptions: { critical: number; warning: number; info: number };
  qualification: Qualification;
  terms: ResponseTerms;
};

export type Comparison = {
  lines: RfqLine[];
  suppliers: SupplierSummary[];
  cells: Record<string, Record<string, Cell>>; // [rfq_line_id][supplier_id]
  bestByLine: Record<string, { supplierId: string; unitPrice: number } | null>;
};

export function sourceRefLabel(loc: ExtractedLine["source_location"], fileName?: string | null): string | null {
  if (!loc && !fileName) return null;
  const parts: string[] = [];
  if (fileName || loc?.file) parts.push(String(fileName || loc?.file));
  if (loc?.sheet) parts.push(`sheet "${loc.sheet}"`);
  if (loc?.cell) parts.push(`cell ${loc.cell}`);
  else if (loc?.row) parts.push(`row ${loc.row}`);
  if (loc?.page) parts.push(`p.${loc.page}`);
  if (loc?.paragraph) parts.push(`¶${loc.paragraph}`);
  if (loc?.region) parts.push(loc.region);
  return parts.join(" · ") || null;
}

export function buildComparison(input: {
  lines: RfqLine[];
  suppliers: Supplier[];
  responses: SupplierResponse[]; // active only
  normalized: NormalizedLine[];
  extracted: ExtractedLine[];
  exceptions: ExceptionRow[];
  questions: RfqQuestion[];
  answers: QuestionnaireAnswer[];
  fileNames?: Record<string, string>; // source_file_id -> name
}): Comparison {
  const { lines, suppliers, responses, normalized, extracted, exceptions, questions, answers } = input;
  const exById = new Map(extracted.map((e) => [e.id, e]));
  const respBySupplier = new Map(responses.map((r) => [r.supplier_id, r]));
  const outlierLines = new Set(
    exceptions.filter((e) => e.type === "price_outlier" && e.status !== "resolved").map((e) => e.extracted_line_id),
  );
  const cells: Comparison["cells"] = {};
  for (const l of lines) cells[l.id] = {};

  const summaries: SupplierSummary[] = suppliers.map((s) => {
    const resp = respBySupplier.get(s.id) ?? null;
    const rows = resp ? normalized.filter((n) => n.response_id === resp.id) : [];
    let comparableCount = 0;
    let reviewCount = 0;
    let comparableTotal = 0;
    const missingLines: number[] = [];
    for (const l of lines) {
      const cands = rows.filter((r) => r.rfq_line_id === l.id && r.status !== "excluded");
      let cell: Cell;
      if (!resp) {
        cell = emptyCell("no_response", "No response received");
      } else if (cands.length === 0) {
        cell = emptyCell("missing", "Not quoted");
        missingLines.push(l.line_no);
      } else if (cands.length > 1) {
        const ex0 = exById.get(cands[0].extracted_line_id);
        cell = {
          ...emptyCell("conflict", cands[0].status_reason ?? "Conflicting values"),
          raw: rawOf(ex0),
          extractedLineId: cands[0].extracted_line_id,
        };
        reviewCount++;
      } else {
        const n = cands[0];
        const ex = exById.get(n.extracted_line_id);
        const flags: string[] = [];
        if (ex?.confidence === "low") flags.push("low_confidence");
        if (outlierLines.has(n.extracted_line_id)) flags.push("outlier");
        if (n.tax_treatment === "unknown") flags.push("tax_assumed");
        if (ex && !ex.source_snippet && !ex.source_location) flags.push("no_source");
        cell = {
          state: n.status === "comparable" ? "comparable" : "needs_review",
          unitPrice: n.status === "comparable" ? n.unit_price_base : null,
          extended: n.status === "comparable" ? n.extended_price_base : null,
          raw: rawOf(ex),
          reason: n.status_reason,
          rules: n.rules_applied ?? [],
          hasOverride: n.has_override,
          confidence: ex?.confidence ?? null,
          extractedLineId: n.extracted_line_id,
          fx: n.fx_rate ? { rate: n.fx_rate, asOf: n.fx_as_of, source: n.fx_source, currency: n.quote_currency ?? "" } : null,
          flags,
          source: ex
            ? { snippet: ex.source_snippet, ref: sourceRefLabel(ex.source_location, ex.source_file_id ? input.fileNames?.[ex.source_file_id] : null) }
            : null,
        };
        if (cell.state === "comparable") {
          comparableCount++;
          comparableTotal += n.extended_price_base ?? 0;
        } else reviewCount++;
      }
      cells[l.id][s.id] = cell;
    }
    // ambiguous rows (no rfq line) count as review items for the supplier
    reviewCount += rows.filter((r) => !r.rfq_line_id && r.status === "needs_review").length;
    const ex = exceptions.filter((e) => resp && e.response_id === resp.id && (e.status ?? "open") === "open");
    const qa = resp ? answers.filter((a) => a.response_id === resp.id) : [];
    return {
      supplier: s,
      response: resp,
      coverage: lines.length - missingLines.length - (resp ? 0 : lines.length),
      comparableCount,
      reviewCount,
      missingLines,
      comparableTotal: Math.round(comparableTotal * 100) / 100,
      openExceptions: {
        critical: ex.filter((e) => e.severity === "critical").length,
        warning: ex.filter((e) => e.severity === "warning").length,
        info: ex.filter((e) => e.severity === "info").length,
      },
      qualification: resp ? qualify(questions, qa) : { status: "incomplete", label: "No response", failed: [], missing: [], unverified: [] },
      terms: resp?.terms ?? {},
    };
  });

  const bestByLine: Comparison["bestByLine"] = {};
  for (const l of lines) {
    let best: { supplierId: string; unitPrice: number } | null = null;
    let n = 0;
    for (const s of suppliers) {
      const c = cells[l.id][s.id];
      if (c.state === "comparable" && c.unitPrice !== null && !c.flags.includes("outlier")) {
        n++;
        if (!best || c.unitPrice < best.unitPrice) best = { supplierId: s.id, unitPrice: c.unitPrice };
      }
    }
    // "lowest" only means something when at least two suppliers are comparable on the line
    bestByLine[l.id] = n >= 2 ? best : null;
  }
  return { lines, suppliers: summaries, cells, bestByLine };
}

function rawOf(ex: ExtractedLine | undefined): Cell["raw"] {
  if (!ex) return null;
  return {
    price: ex.raw_unit_price,
    currency: ex.raw_currency,
    basis: ex.raw_price_basis,
    basisQty: ex.raw_basis_quantity,
    uom: ex.raw_uom,
    description: ex.raw_description,
  };
}

function emptyCell(state: CellState, reason: string): Cell {
  return { state, unitPrice: null, extended: null, raw: null, reason, rules: [], hasOverride: false, confidence: null, extractedLineId: null, fx: null, flags: [], source: null };
}

// ---------------------------------------------------------------------------
// Award scenarios
// ---------------------------------------------------------------------------
export type ScenarioOptions = {
  mode: "split_cheapest" | "single_supplier";
  supplierId?: string; // for single_supplier
  onlyQualified: boolean; // qualified_verified or qualified_claimed
  requireVerified: boolean; // only qualified_verified
  includeFreight: boolean;
  applyConditionalDiscounts: boolean;
  excludeFlagged: boolean; // skip outliers / low confidence cells
};

export type ScenarioResult = {
  key: string;
  title: string;
  awards: { lineId: string; lineNo: number; description: string; supplierId: string; supplierName: string; unitPrice: number; quantity: number; uom: string; extended: number }[];
  unpricedLines: { lineNo: number; description: string; why: string }[];
  bySupplier: { supplierId: string; supplierName: string; lines: number; subtotal: number; freight: number | null; freightNote: string; discount: number; total: number | null }[];
  subtotal: number;
  freightTotal: number;
  discountTotal: number;
  total: number;
  totalIsComplete: boolean; // false when freight unknown for an awarded supplier or lines unpriced
  eligibleSuppliers: string[];
  excludedSuppliers: { name: string; why: string }[];
  assumptions: string[];
};

export function scenarioKey(o: ScenarioOptions) {
  return [o.mode, o.supplierId ?? "", o.onlyQualified ? "q" : "", o.requireVerified ? "v" : "", o.includeFreight ? "f" : "", o.applyConditionalDiscounts ? "d" : "", o.excludeFlagged ? "x" : ""].join("|");
}

export function computeScenario(cmp: Comparison, o: ScenarioOptions, baseCurrency = "INR"): ScenarioResult {
  const assumptions: string[] = [
    `All prices normalized to ${baseCurrency} per requested unit, ex-GST. Missing quotes are never treated as zero.`,
  ];
  const excludedSuppliers: ScenarioResult["excludedSuppliers"] = [];
  let pool = cmp.suppliers.filter((s) => s.response);
  for (const s of cmp.suppliers.filter((s) => !s.response)) excludedSuppliers.push({ name: s.supplier.name, why: "no response" });
  if (o.mode === "single_supplier") {
    pool = pool.filter((s) => s.supplier.id === o.supplierId);
  }
  if (o.onlyQualified || o.requireVerified) {
    const ok = (s: SupplierSummary) =>
      o.requireVerified ? s.qualification.status === "qualified_verified" : s.qualification.status === "qualified_verified" || s.qualification.status === "qualified_claimed";
    for (const s of pool.filter((s) => !ok(s))) excludedSuppliers.push({ name: s.supplier.name, why: s.qualification.label });
    pool = pool.filter(ok);
    assumptions.push(
      o.requireVerified
        ? "Only suppliers whose must-pass answers are met and evidence verified by a buyer."
        : "Only suppliers meeting all must-pass questionnaire items (supplier claims count until verified or rejected).",
    );
  }
  if (o.excludeFlagged) assumptions.push("Prices flagged as outliers or low-confidence are excluded.");

  const awards: ScenarioResult["awards"] = [];
  const unpricedLines: ScenarioResult["unpricedLines"] = [];
  for (const l of cmp.lines) {
    let best: { s: SupplierSummary; c: Cell } | null = null;
    for (const s of pool) {
      const c = cmp.cells[l.id][s.supplier.id];
      if (c.state !== "comparable" || c.unitPrice === null) continue;
      if (o.excludeFlagged && (c.flags.includes("outlier") || c.flags.includes("low_confidence"))) continue;
      if (!best || c.unitPrice < (best.c.unitPrice as number)) best = { s, c };
    }
    if (!best) {
      const states = pool.map((s) => cmp.cells[l.id][s.supplier.id].state);
      const why = pool.length === 0 ? "no eligible supplier" : states.every((st) => st === "missing") ? "not quoted by eligible suppliers" : "only unreviewed / non-comparable quotes";
      unpricedLines.push({ lineNo: l.line_no, description: l.description, why });
      continue;
    }
    awards.push({
      lineId: l.id,
      lineNo: l.line_no,
      description: l.description,
      supplierId: best.s.supplier.id,
      supplierName: best.s.supplier.name,
      unitPrice: best.c.unitPrice as number,
      quantity: Number(l.quantity),
      uom: l.uom,
      extended: Math.round((best.c.unitPrice as number) * Number(l.quantity) * 100) / 100,
    });
  }

  const bySupplier: ScenarioResult["bySupplier"] = [];
  let totalIsComplete = unpricedLines.length === 0;
  for (const s of pool) {
    const mine = awards.filter((a) => a.supplierId === s.supplier.id);
    if (!mine.length) continue;
    const subtotal = mine.reduce((a, b) => a + b.extended, 0);
    let freight: number | null = 0;
    let freightNote = "";
    const fr = s.terms.freight;
    if (o.includeFreight) {
      if (!fr || fr.type === "not_stated") {
        freight = null;
        freightNote = "freight terms not stated";
        totalIsComplete = false;
      } else if (fr.type === "included") {
        freight = 0;
        freightNote = "included in price";
      } else if (fr.type === "extra_percent" && fr.percent) {
        freight = Math.round(subtotal * (fr.percent / 100) * 100) / 100;
        freightNote = `${fr.percent}% of basic value`;
      } else if (fr.type === "extra_amount" && fr.amount) {
        freight = fr.amount;
        freightNote = `stated amount ${fr.amount}`;
      } else {
        freight = null;
        freightNote = "freight extra, amount unknown";
        totalIsComplete = false;
      }
    } else {
      freightNote = fr?.type === "included" ? "included in price" : "excluded from this scenario";
    }
    let discount = 0;
    for (const d of s.terms.discounts ?? []) {
      if (!d.percent) continue;
      if (d.conditional && !o.applyConditionalDiscounts) continue;
      discount += Math.round(subtotal * (d.percent / 100) * 100) / 100;
    }
    bySupplier.push({
      supplierId: s.supplier.id,
      supplierName: s.supplier.name,
      lines: mine.length,
      subtotal: Math.round(subtotal * 100) / 100,
      freight,
      freightNote,
      discount,
      total: freight === null ? null : Math.round((subtotal + freight - discount) * 100) / 100,
    });
  }
  if (o.includeFreight) assumptions.push("Freight added where the supplier stated it; unknown freight is flagged, not guessed.");
  else assumptions.push("Freight excluded (compare like-for-like basic prices).");
  assumptions.push(o.applyConditionalDiscounts ? "Conditional discounts assumed to be met." : "Conditional discounts not applied.");

  const subtotal = bySupplier.reduce((a, b) => a + b.subtotal, 0);
  const freightTotal = bySupplier.reduce((a, b) => a + (b.freight ?? 0), 0);
  const discountTotal = bySupplier.reduce((a, b) => a + b.discount, 0);
  const title =
    o.mode === "single_supplier"
      ? `Single award — ${pool[0]?.supplier.name ?? cmp.suppliers.find((s) => s.supplier.id === o.supplierId)?.supplier.name ?? "supplier"}`
      : `Split award — cheapest per line${o.onlyQualified || o.requireVerified ? " (qualified only)" : ""}`;
  return {
    key: scenarioKey(o),
    title,
    awards,
    unpricedLines,
    bySupplier,
    subtotal: Math.round(subtotal * 100) / 100,
    freightTotal: Math.round(freightTotal * 100) / 100,
    discountTotal: Math.round(discountTotal * 100) / 100,
    total: Math.round((subtotal + freightTotal - discountTotal) * 100) / 100,
    totalIsComplete,
    eligibleSuppliers: pool.map((s) => s.supplier.name),
    excludedSuppliers,
    assumptions,
  };
}

export const inr = (n: number | null | undefined, digits = 2) =>
  n === null || n === undefined ? "—" : "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const inrCompact = (n: number | null | undefined) => {
  if (n === null || n === undefined) return "—";
  if (Math.abs(n) >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
  return inr(n, 0);
};
