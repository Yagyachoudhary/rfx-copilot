import ExcelJS from "exceljs";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RfqBundle } from "./data";
import { sourceRefLabel, type ScenarioResult } from "./compare";

export type Sheet = { name: string; columns: string[]; rows: any[][]; note?: string };

export async function buildXlsx(sheets: Sheet[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "RFx Copilot";
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name.slice(0, 31));
    let r = 1;
    if (s.note) {
      ws.getCell(r, 1).value = s.note;
      ws.getCell(r, 1).font = { italic: true, color: { argb: "FF555555" } };
      r += 2;
    }
    s.columns.forEach((c, i) => {
      const cell = ws.getCell(r, i + 1);
      cell.value = c;
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE7E4F3" } };
    });
    ws.views = [{ state: "frozen", ySplit: r }];
    s.rows.forEach((row, ri) => row.forEach((v, ci) => (ws.getCell(r + 1 + ri, ci + 1).value = v === undefined ? null : v)));
    s.columns.forEach((c, i) => (ws.getColumn(i + 1).width = Math.min(48, Math.max(10, c.length + 2))));
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function buildCsv(columns: string[], rows: any[][]): Buffer {
  const esc = (v: any) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return Buffer.from([columns.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n"), "utf8");
}

export async function uploadExport(db: SupabaseClient, orgId: string, rfqId: string, fileName: string, buf: Buffer, contentType: string) {
  const safe = fileName.replace(/[^\w.\-]+/g, "_");
  const path = `${orgId}/${rfqId}/${new Date().toISOString().replace(/[:.]/g, "-")}-${safe}`;
  const { error } = await db.storage.from("exports").upload(path, buf, { contentType, upsert: false });
  if (error) throw new Error(`Export upload failed: ${error.message}`);
  const { data } = await db.storage.from("exports").createSignedUrl(path, 60 * 60, { download: safe });
  return { path, url: data?.signedUrl ?? null, fileName: safe };
}

/** Full comparison workbook: matrix, long-form detail with provenance, suppliers, exceptions, optional scenario. */
export function comparisonSheets(b: RfqBundle, scenario?: ScenarioResult | null): Sheet[] {
  const cmp = b.comparison;
  const sups = cmp.suppliers.filter((s) => s.response);
  const matrix: Sheet = {
    name: "Comparison",
    note: `${b.rfq.ref_code} — normalized unit price (${b.rfq.currency}, ex-GST, per requested UOM). "NOT QUOTED" and "REVIEW" are not prices. Fictional demo data.`,
    columns: ["Line", "Description", "Qty", "UOM", ...sups.map((s) => s.supplier.name), "Lowest comparable"],
    rows: cmp.lines.map((l) => {
      const best = cmp.bestByLine[l.id];
      return [
        l.line_no,
        l.description,
        Number(l.quantity),
        l.uom,
        ...sups.map((s) => {
          const c = cmp.cells[l.id][s.supplier.id];
          if (c.state === "comparable") return c.unitPrice;
          if (c.state === "missing") return "NOT QUOTED";
          if (c.state === "conflict") return "CONFLICT";
          return "REVIEW";
        }),
        best ? `${cmp.suppliers.find((s) => s.supplier.id === best.supplierId)?.supplier.name} @ ${best.unitPrice}` : "—",
      ];
    }),
  };
  const fileName = new Map(b.files.map((f) => [f.id, f.file_name]));
  const detail: Sheet = {
    name: "Detail & sources",
    columns: ["Supplier", "Line", "State", "Raw price", "Raw currency", "Raw basis", "Basis qty", "Raw unit", "Normalized unit price", "Extended", "FX rate", "Rules applied", "Reason / issue", "Confidence", "Buyer override", "Source file", "Source ref", "Source snippet"],
    rows: [],
  };
  for (const s of sups) {
    for (const l of cmp.lines) {
      const c = cmp.cells[l.id][s.supplier.id];
      const ex = c.extractedLineId ? b.extracted.find((e) => e.id === c.extractedLineId) : undefined;
      detail.rows.push([
        s.supplier.name, l.line_no, c.state, c.raw?.price ?? null, c.raw?.currency ?? null, c.raw?.basis ?? null, c.raw?.basisQty ?? null, c.raw?.uom ?? null,
        c.unitPrice, c.extended, c.fx?.rate ?? null, c.rules.join("; "), c.reason, c.confidence, c.hasOverride ? "yes" : "",
        ex?.source_file_id ? fileName.get(ex.source_file_id) ?? "" : "", ex ? sourceRefLabel(ex.source_location, null) ?? "" : "", ex?.source_snippet ?? "",
      ]);
    }
  }
  const supplierSheet: Sheet = {
    name: "Suppliers",
    columns: ["Supplier", "Version", "Coverage (lines)", "Comparable", "Needs review", "Missing lines", "Comparable total", "Qualification", "Currency", "Tax", "Freight", "Payment", "Validity (days)", "Lead time (days)", "Open critical", "Open warnings"],
    rows: sups.map((s) => [
      s.supplier.name, s.response?.version, `${s.coverage}/${cmp.lines.length}`, s.comparableCount, s.reviewCount, s.missingLines.map((n) => `L${n}`).join(", "),
      s.comparableTotal, s.qualification.label, s.terms.currency ?? "", s.terms.tax_treatment ?? "", s.terms.freight?.text ?? s.terms.freight?.type ?? "",
      s.terms.payment_terms ?? "", s.terms.validity_days ?? "", s.terms.lead_time_days ?? "", s.openExceptions.critical, s.openExceptions.warning,
    ]),
  };
  const supName = new Map(b.suppliers.map((s) => [s.id, s.name]));
  const lineNo = new Map(b.lines.map((l) => [l.id, l.line_no]));
  const exc: Sheet = {
    name: "Exceptions",
    columns: ["Supplier", "Line", "Severity", "Status", "Type", "Title", "Explanation", "Suggested resolution", "Resolution note"],
    rows: b.exceptions.map((e) => [e.supplier_id ? supName.get(e.supplier_id) : "", e.rfq_line_id ? lineNo.get(e.rfq_line_id) : "", e.severity, e.status, e.type, e.title, e.explanation, e.suggested_resolution, e.resolution_note ?? ""]),
  };
  const sheets = [matrix, detail, supplierSheet, exc];
  if (scenario) {
    sheets.push({
      name: "Award scenario",
      note: `${scenario.title}. Assumptions: ${scenario.assumptions.join(" ")}${scenario.totalIsComplete ? "" : " TOTAL IS INCOMPLETE — see unpriced lines / unknown freight."}`,
      columns: ["Line", "Description", "Supplier", "Unit price", "Qty", "UOM", "Extended"],
      rows: [
        ...scenario.awards.map((a) => [a.lineNo, a.description, a.supplierName, a.unitPrice, a.quantity, a.uom, a.extended]),
        ...scenario.unpricedLines.map((u) => [u.lineNo, u.description, "UNPRICED", null, null, null, u.why]),
        [],
        ["", "Subtotal", "", "", "", "", scenario.subtotal],
        ["", "Freight", "", "", "", "", scenario.freightTotal],
        ["", "Discounts", "", "", "", "", -scenario.discountTotal],
        ["", "Evaluated total", "", "", "", "", scenario.total],
      ],
    });
  }
  return sheets;
}
