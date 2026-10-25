/**
 * Deterministic normalization. The language model extracts raw values; this file decides
 * what is comparable. Conversions are applied only when the rule is explicit and evidenced.
 * Unknown or missing values are never turned into zero.
 */
import type { CurrencyPolicy, ExtractedLine, NormalizedLine, Override, ResponseTerms, RfqLine } from "./types";

export type UnitFamily = "count" | "set" | "roll" | "kg" | "unknown";

const UNIT_ALIASES: Record<string, UnitFamily> = {
  pc: "count", pcs: "count", piece: "count", pieces: "count", no: "count", nos: "count", "no.": "count", "nos.": "count",
  each: "count", ea: "count", unit: "count", units: "count", box: "count", boxes: "count", carton: "count", cartons: "count",
  set: "set", sets: "set",
  roll: "roll", rolls: "roll",
  kg: "kg", kgs: "kg", kilogram: "kg", kilograms: "kg",
};

export function unitFamily(uom: string | null | undefined): UnitFamily {
  if (!uom) return "unknown";
  const k = uom.trim().toLowerCase().replace(/^per\s+/, "").replace(/^\d+\s*/, "");
  return UNIT_ALIASES[k] ?? "unknown";
}

/** The buyer's requested UOM family for an RFQ line. */
export function requestedFamily(line: RfqLine): UnitFamily {
  return unitFamily(line.uom);
}

export type EffectiveRaw = {
  mapped_line_id: string | null;
  mapping_confidence: ExtractedLine["mapping_confidence"];
  raw_unit_price: number | null;
  raw_price_basis: ExtractedLine["raw_price_basis"];
  raw_basis_quantity: number | null;
  raw_currency: string | null;
  tax_inclusive: boolean | null;
  excluded: boolean;
  excludedReason: string | null;
  overriddenFields: string[];
};

export function applyOverrides(line: ExtractedLine, overrides: Override[]): EffectiveRaw {
  const eff: EffectiveRaw = {
    mapped_line_id: line.mapped_line_id,
    mapping_confidence: line.mapping_confidence,
    raw_unit_price: line.raw_unit_price,
    raw_price_basis: line.raw_price_basis,
    raw_basis_quantity: line.raw_basis_quantity,
    raw_currency: line.raw_currency,
    tax_inclusive: null,
    excluded: false,
    excludedReason: null,
    overriddenFields: [],
  };
  const active = overrides
    .filter((o) => o.is_active && o.extracted_line_id === line.id)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  for (const o of active) {
    switch (o.field) {
      case "mapped_line_id":
        eff.mapped_line_id = o.new_value ?? null;
        eff.mapping_confidence = o.new_value ? "high" : "none";
        break;
      case "raw_unit_price":
        eff.raw_unit_price = o.new_value === null || o.new_value === "" ? null : Number(o.new_value);
        break;
      case "raw_price_basis":
        eff.raw_price_basis = o.new_value;
        break;
      case "raw_basis_quantity":
        eff.raw_basis_quantity = o.new_value === null || o.new_value === "" ? null : Number(o.new_value);
        break;
      case "raw_currency":
        eff.raw_currency = o.new_value;
        break;
      case "tax_inclusive":
        eff.tax_inclusive = Boolean(o.new_value);
        break;
      case "exclude":
        eff.excluded = Boolean(o.new_value);
        eff.excludedReason = o.reason;
        break;
      case "choose_in_conflict":
        // handled at response level (other lines get excluded)
        break;
    }
    eff.overriddenFields.push(o.field);
  }
  return eff;
}

const round = (n: number, d = 4) => Math.round(n * 10 ** d) / 10 ** d;

export type NormalizeInput = {
  line: ExtractedLine;
  supplierId: string;
  rfqLinesById: Map<string, RfqLine>;
  terms: ResponseTerms;
  policy: CurrencyPolicy;
  baseCurrency: string;
  overrides: Override[];
  /** pack evidence accepted by buyer through override counts as evidence */
};

export function normalizeLine(input: NormalizeInput): NormalizedLine {
  const { line, supplierId, rfqLinesById, terms, policy, baseCurrency, overrides } = input;
  const eff = applyOverrides(line, overrides);
  const rules: string[] = [];
  const out: NormalizedLine = {
    response_id: line.response_id,
    extracted_line_id: line.id,
    rfq_line_id: null,
    supplier_id: supplierId,
    normalized_uom: null,
    units_per_quoted_unit: null,
    unit_price_quoted_ccy: null,
    quote_currency: null,
    fx_rate: null,
    fx_as_of: null,
    fx_source: null,
    tax_treatment: null,
    unit_price_base: null,
    extended_price_base: null,
    status: "needs_review",
    status_reason: null,
    rules_applied: rules,
    has_override: eff.overriddenFields.length > 0,
  };
  const review = (reason: string) => {
    out.status = "needs_review";
    out.status_reason = reason;
    return out;
  };

  if (eff.excluded) {
    out.status = "excluded";
    out.status_reason = `Excluded by buyer: ${eff.excludedReason ?? "no reason given"}`;
    out.rfq_line_id = eff.mapped_line_id;
    return out;
  }

  // 1. Mapping — low-confidence matches are never forced.
  const target = eff.mapped_line_id ? rfqLinesById.get(eff.mapped_line_id) : undefined;
  if (!target) {
    const cands = (line.mapping_candidates ?? []).map((c) => `L${c.line_no}`).join(", ");
    return review(cands ? `Ambiguous mapping — candidates ${cands}` : "Not mapped to any RFQ line");
  }
  if (eff.mapping_confidence === "low") {
    const cands = (line.mapping_candidates ?? []).map((c) => `L${c.line_no}`).join(", ");
    return review(`Low-confidence mapping to L${target.line_no}${cands ? ` (also possible: ${cands})` : ""} — confirm before comparing`);
  }
  out.rfq_line_id = target.id;
  out.normalized_uom = target.uom;

  // 2. Price present?
  if (eff.raw_unit_price === null || eff.raw_unit_price === undefined || Number.isNaN(eff.raw_unit_price)) {
    return review(line.legibility === "unreadable" ? "Price unreadable in source — enter it from the document or exclude" : "No price found for this line");
  }
  if (eff.raw_unit_price <= 0) return review("Quoted price is zero or negative — verify with supplier");

  // 3. Unit basis -> price per requested UOM (in quote currency)
  const reqFam = requestedFamily(target);
  const basis = eff.raw_price_basis ?? "unknown";
  const quotedFam = unitFamily(line.raw_uom);
  let divisor: number | null = null;
  const famOk = (f: UnitFamily) => f === reqFam || f === "unknown";
  switch (basis) {
    case "per_unit":
      if (reqFam === "kg" && quotedFam !== "kg" && quotedFam !== "unknown") return review(`Quoted per ${line.raw_uom}; RFQ asks per kg`);
      if (reqFam !== "kg" && quotedFam === "kg") return review(`Priced per kg; RFQ asks per ${target.uom}. Needs unit weight evidence to convert`);
      if (!famOk(quotedFam)) return review(`Quoted per ${line.raw_uom}; RFQ asks per ${target.uom}`);
      divisor = 1;
      rules.push(quotedFam === "unknown" && line.raw_uom ? `Unit "${line.raw_uom}" read as per ${target.uom}` : `Quoted per ${target.uom}`);
      break;
    case "per_n_units": {
      const n = eff.raw_basis_quantity;
      if (!n || n <= 0) return review("Quoted per N units but N is not stated");
      if (!famOk(quotedFam)) return review(`Quoted per ${n} ${line.raw_uom}; RFQ asks per ${target.uom}`);
      divisor = n;
      rules.push(`Quoted per ${n} ${line.raw_uom ?? target.uom} → ÷${n}`);
      break;
    }
    case "per_pack": {
      const n = eff.raw_basis_quantity;
      const evidence = line.pack_size_evidence || (eff.overriddenFields.includes("raw_basis_quantity") ? "buyer-confirmed pack size" : null);
      if (!n || n <= 0 || !evidence) return review("Priced per box/pack, but the pack size is not evidenced — cannot compare per unit");
      divisor = n;
      rules.push(`Pack of ${n} (${evidence.length > 60 ? evidence.slice(0, 57) + "…" : evidence}) → ÷${n}`);
      break;
    }
    case "per_kg":
      if (reqFam === "kg") {
        divisor = 1;
        rules.push("Quoted per kg");
      } else {
        return review(`Priced per kg; RFQ asks per ${target.uom}. Needs unit weight evidence to convert`);
      }
      break;
    case "lump_sum":
      return review("Lump-sum price — cannot derive a unit price");
    default:
      return review("Price basis unclear (per unit / per pack / per kg?)");
  }
  out.units_per_quoted_unit = divisor;
  const perUnitQuoted = eff.raw_unit_price / divisor;
  out.unit_price_quoted_ccy = round(perUnitQuoted);

  // 4. Currency — explicit rate, date and policy, or no comparison.
  const ccy = (eff.raw_currency || terms.currency || "").toUpperCase() || null;
  if (!ccy) return review("Currency not stated");
  out.quote_currency = ccy;
  let base = perUnitQuoted;
  if (ccy !== baseCurrency) {
    const r = policy.rates?.[ccy];
    if (!r || !r.rate) return review(`Quoted in ${ccy}; no ${ccy}→${baseCurrency} rate in the RFx currency policy`);
    out.fx_rate = r.rate;
    out.fx_as_of = r.as_of;
    out.fx_source = r.source;
    base = perUnitQuoted * r.rate;
    rules.push(`${ccy}→${baseCurrency} @ ${r.rate} (${r.source}, as of ${r.as_of})`);
  }

  // 5. Tax — compare ex-GST. Inclusive prices are converted only when the rate is stated.
  const inclusive = eff.tax_inclusive ?? (terms.tax_treatment === "inclusive" ? true : terms.tax_treatment === "exclusive" ? false : null);
  if (inclusive === true) {
    const rate = terms.tax_rate_percent;
    if (!rate) return review("Price is tax-inclusive but the tax rate is not stated");
    base = base / (1 + rate / 100);
    out.tax_treatment = "inclusive_converted";
    rules.push(`Removed GST ${rate}% (quoted inclusive)`);
  } else if (inclusive === false) {
    out.tax_treatment = "exclusive";
  } else {
    out.tax_treatment = "unknown";
    rules.push("Tax treatment not stated — treated as ex-GST (assumption, flagged)");
  }

  out.unit_price_base = round(base);
  out.extended_price_base = round(base * Number(target.quantity), 2);
  out.status = "comparable";
  out.status_reason = null;
  return out;
}

/**
 * Response-level post-pass: if two or more lines in the same response map to the same RFQ line,
 * none of them is comparable until the buyer picks one (choose_in_conflict override excludes the others).
 */
export function resolveConflicts(rows: NormalizedLine[], extracted: ExtractedLine[], overrides: Override[]): NormalizedLine[] {
  const byLine = new Map<string, NormalizedLine[]>();
  for (const r of rows) {
    if (!r.rfq_line_id || r.status === "excluded") continue;
    const arr = byLine.get(r.rfq_line_id) ?? [];
    arr.push(r);
    byLine.set(r.rfq_line_id, arr);
  }
  const chosen = new Set(overrides.filter((o) => o.is_active && o.field === "choose_in_conflict").map((o) => o.extracted_line_id));
  const exById = new Map(extracted.map((e) => [e.id, e]));
  for (const [, arr] of byLine) {
    if (arr.length < 2) continue;
    const pick = arr.find((r) => chosen.has(r.extracted_line_id));
    if (pick) {
      for (const r of arr) {
        if (r !== pick) {
          r.status = "excluded";
          r.status_reason = "Not selected in a conflict (buyer chose another value)";
        }
      }
      pick.rules_applied.push("Selected by buyer among conflicting values");
      continue;
    }
    const prices = arr
      .map((r) => exById.get(r.extracted_line_id)?.raw_unit_price)
      .filter((p) => p !== null && p !== undefined)
      .join(" vs ");
    for (const r of arr) {
      r.status = "needs_review";
      r.status_reason = `Conflicting values for the same RFQ line (${prices}) — choose one`;
    }
  }
  return rows;
}
