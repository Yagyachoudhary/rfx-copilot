/** Test-only: insert canned extraction outputs through the real persistence/normalization path (local stack). */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";
import { persistExtraction, recomputeResponse, refreshOutliers, tokenClient } from "../src/lib/pipeline";
import { createResponse, mimeFor, readManifest, readSampleFile } from "../src/lib/responses";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function sbcOutput(file: string) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(readSampleFile(file) as any);
  const ws = wb.getWorksheet("Quotation")!;
  const m = readManifest();
  const lines: any[] = [];
  ws.eachRow((row, r) => {
    const code = String(row.getCell(2).value ?? "");
    if (!code.startsWith("SBC-")) return;
    const no = Number(code.match(/(\d{3})/)![1]);
    const per = String(row.getCell(7).value);
    lines.push({
      raw_text: `${row.getCell(3).value} ${row.getCell(4).value}`, raw_item_code: code, rfq_line_no: no, mapping_confidence: "high", candidate_line_nos: [],
      uom: per === "100 Nos" ? "Nos" : per, unit_price: Number(row.getCell(6).value), currency: "INR",
      price_basis: per === "100 Nos" ? "per_n_units" : "per_unit", basis_quantity: per === "100 Nos" ? 100 : null,
      confidence: "high", legibility: "clear", source: { file_index: 1, sheet: "Quotation", cell: `F${r}`, row: r }, source_snippet: `R${r}: ${row.getCell(3).value} | ${row.getCell(6).value} | ${per}`,
    });
  });
  void m;
  return {
    document_overview: "Excel quotation on supplier's own template (canned test output)", currency: { code: "INR" }, tax: { treatment: "exclusive", rate_percent: 18, text: "GST @ 18% extra" },
    freight: { type: "included", text: "Included - door delivery Hosur DC", source: { file_index: 1, sheet: "Terms", cell: "B4" } }, payment_terms: { text: "45 days from invoice", days: 45 }, validity_days: 30, lead_time: { days: 10, text: "10 working days" },
    discounts: [], unresolved_references: [], lines,
    questionnaire: [
      { q_no: 1, raw_answer: "Yes - certificate available on request", value_bool: true, evidence_type: "claim", confidence: "high", source: { file_index: 1, sheet: "Vendor Questionnaire", cell: "B3" } },
      { q_no: 2, raw_answer: "Yes, in-house calibrated BCT tester", value_bool: true, evidence_type: "claim", confidence: "high" },
      { q_no: 3, raw_answer: "220 MT / month", value_number: 220, evidence_type: "claim", confidence: "high" },
      { q_no: 4, raw_answer: "10 days regular, 15 days printed", value_number: 10, evidence_type: "claim", confidence: "medium" },
      { q_no: 5, raw_answer: "No - our standard is 45 days", value_bool: false, evidence_type: "claim", confidence: "high" },
    ],
    extraction_warnings: [],
  } as any;
}

const slp = {
  document_overview: "Short email (canned test output)", currency: { code: "INR" }, tax: { treatment: "not_stated" }, freight: { type: "extra_unquantified", text: "freight extra", source: { file_index: 1, paragraph: 8 } },
  payment_terms: { text: "60 days ok", days: 60 }, lead_time: { days: 14, text: "2 weeks" }, discounts: [], unresolved_references: [{ text: "rest same as last year", source: { file_index: 1, paragraph: 8 } }],
  lines: [
    ...[7, 8, 9, 10, 11, 12].map((n) => ({ raw_text: "5-ply @ Rs 42/kg", rfq_line_no: n, mapping_confidence: "medium", uom: "kg", unit_price: 42, currency: "INR", price_basis: "per_kg", confidence: "medium", legibility: "clear", notes: "group price", source: { file_index: 1, paragraph: 8 }, source_snippet: "Rs 42/kg for the 5-ply" })),
    { raw_text: "48mm tape Rs 31 per roll", rfq_line_no: 25, mapping_confidence: "high", uom: "roll", unit_price: 31, currency: "INR", price_basis: "per_unit", confidence: "high", legibility: "clear", source: { file_index: 1, paragraph: 9 }, source_snippet: "48mm tape we can do at Rs 31 per roll" },
    { raw_text: "72mm printed tape Rs 55", rfq_line_no: 26, mapping_confidence: "high", uom: "roll", unit_price: 55, currency: "INR", price_basis: "per_unit", confidence: "medium", legibility: "clear", source: { file_index: 1, paragraph: 9 }, source_snippet: "72mm printed tape Rs 55" },
  ],
  questionnaire: [{ q_no: 5, raw_answer: "Payment 60 days ok for us", value_bool: true, evidence_type: "claim", confidence: "high" }],
  extraction_warnings: [],
} as any;

const phase = process.argv[2] ?? "a";
const EMAIL = "yagya.preview@demo.test", PW = "demo-pass-123";
(async () => {
  const sb = createClient(URL, ANON);
  if (phase === "a") {
    const { error: se } = await sb.auth.signUp({ email: EMAIL, password: PW });
    if (se) throw se;
  }
  const { data: auth, error } = await sb.auth.signInWithPassword({ email: EMAIL, password: PW });
  if (error) throw error;
  const db = tokenClient(auth.session!.access_token);
  const actor0 = { userId: auth.user!.id, email: auth.user!.email ?? null };
  if (phase === "a") {
    const { data: orgId, error: oe } = await db.rpc("create_organization", { p_name: "Nilgiri Consumer Foods (Demo)", p_full_name: "Yagya" });
    if (oe) throw oe;
    const { seedDemo } = await import("../src/lib/responses");
    await seedDemo(db, { orgId: orgId as string, ...actor0 });
  }
  const { data: mem } = await db.from("memberships").select("org_id").single();
  const actor = { orgId: mem!.org_id, ...actor0 };
  const { data: rfq } = await db.from("rfqs").select("id").eq("ref_code", "RFQ-2026-0142").single();
  const [{ data: lines }, { data: questions }] = await Promise.all([db.from("rfq_line_items").select("*").eq("rfq_id", rfq!.id), db.from("rfq_questions").select("*").eq("rfq_id", rfq!.id)]);
  const m = readManifest();
  const doIt = async (idx: number, out: any) => {
    const s = m.sample_responses[idx];
    const sup = m.suppliers.find((x) => x.key === s.supplier)!;
    const { data: sr } = await db.from("suppliers").select("id").eq("name", sup.name).single();
    const resp = await createResponse(db, actor, { rfqId: rfq!.id, supplierId: sr!.id, channel: s.channel, receivedAt: s.received_at, subject: s.email_subject, body: s.email_body, files: s.files.map((f) => ({ name: f.path.split("/").pop()!, mime: mimeFor(f.path), buf: readSampleFile(f.path), kind: f.kind })) });
    const { data: files } = await db.from("source_files").select("*").eq("response_id", resp.id).order("created_at");
    const { data: run } = await db.from("extraction_runs").insert({ org_id: actor.orgId, response_id: resp.id, model: "preview: prepared (not live model)", status: "succeeded", started_at: new Date(Date.now() - 41000).toISOString(), finished_at: new Date().toISOString(), raw_output: out }).select("id").single();
    await persistExtraction(db, actor, resp as any, out, run!.id, lines as any, questions as any, files as any);
    console.log(s.supplier, "v" + s.version, await recomputeResponse(db, actor, resp.id));
  };
  const canned = (k: string) => JSON.parse(fs.readFileSync(`scripts/canned/${k}.json`, "utf8"));
  if (phase === "a") {
    await doIt(0, await sbcOutput(m.sample_responses[0].files[0].path));
    await doIt(1, canned("deccan"));
    await doIt(2, canned("pacific"));
    await doIt(3, canned("hosur-box"));
    await doIt(4, slp);
  } else {
    const out = await sbcOutput(m.sample_responses[5].files[0].path);
    out.supersedes_note = "REVISED QUOTATION - supersedes SBC/Q/26-27/0418. Item 3 rate corrected, duplicate line removed.";
    await doIt(5, out);
  }
  await refreshOutliers(db, actor, rfq!.id);
  fs.writeFileSync("/tmp/claude-0/rfqid", rfq!.id);
})().catch((e) => { console.error(e); process.exit(1); });
