"""Preview-only: hand/script-prepared extraction outputs (stand-ins until the live model runs)."""
import json, re, pdfplumber, docx
OUT = "scripts/canned"
src = lambda **k: {"file_index": 1, **k}

# ---- Deccan (PDF table) ----
missing = {22, 27, 28}
order = [n for n in range(1, 31) if n not in missing]
lines = []
with pdfplumber.open("sample-data/responses/deccan/DPI_Quotation_RFQ-2026-0142.pdf") as pdf:
    rows = [r for r in pdf.pages[0].extract_table() if r and r[0] and r[0].isdigit()]
for r, n in zip(rows, order):
    lines.append(dict(raw_text=r[1], rfq_line_no=n, mapping_confidence="high", candidate_line_nos=[], uom=r[4], unit_price=float(r[5].replace(",", "")),
                      currency="INR", price_basis="per_unit", extended_price=float(r[6].replace(",", "")), confidence="high", legibility="clear",
                      source=src(page=1, region=f"table row {r[0]}"), source_snippet=f"{r[0]} | {r[1]} | {r[3]} {r[4]} | {r[5]}"))
deccan = dict(document_overview="PDF quotation on letterhead; 27 of 30 lines; freight and discount in footnotes; questionnaire on page 2; ISO certificate attached.",
  quote_reference="DPI/HSR/2026/1187", quote_date="30 Oct 2026", currency={"code": "INR"}, tax={"treatment": "exclusive", "rate_percent": 18, "text": "GST @ 18% extra"},
  freight={"type": "extra_percent", "percent": 2.5, "text": "Freight to customer DC will be charged extra @ 2.5% of basic value.", "source": src(page=1, region="footnote *")},
  payment_terms={"text": "60 days from invoice acceptable", "days": 60}, validity_days=60, lead_time={"days": 7, "text": "7 working days from PO"},
  discounts=[{"description": "Special discount of 3% on basic rates", "percent": 3, "conditional": True, "condition": "PO released on or before 30-Nov-2026", "source": src(page=1, region="footnote **")}],
  unresolved_references=[], other_notes=["Not quoted: corrugated sheet roll and stretch film items (explicitly declined)."], lines=lines,
  questionnaire=[
    dict(q_no=1, raw_answer="Yes. Certificate no. QMS-DEMO-44817 attached (valid till 14-Mar-2027).", value_bool=True, evidence_type="document_attached", evidence_snippet="Certificate No: QMS-DEMO-44817 ... Valid until: 14-Mar-2027", source=src(page=2), confidence="high"),
    dict(q_no=2, raw_answer="Yes - in-house lab, equipment calibrated annually (NABL-traceable).", value_bool=True, evidence_type="claim", source=src(page=2), confidence="high"),
    dict(q_no=3, raw_answer="300 tonnes per month", value_number=300, value_unit="t/month", evidence_type="claim", source=src(page=2), confidence="high"),
    dict(q_no=4, raw_answer="7 working days", value_number=7, evidence_type="claim", source=src(page=2), confidence="high"),
    dict(q_no=5, raw_answer="Accepted", value_bool=True, evidence_type="claim", source=src(page=2), confidence="high"),
    dict(q_no=6, raw_answer="Recycled board standard; FSC on request at +4%", value_bool=True, evidence_type="claim", source=src(page=2), confidence="medium"),
    dict(q_no=7, raw_answer="6 km", value_number=6, evidence_type="claim", source=src(page=2), confidence="high"),
    dict(q_no=8, raw_answer="Cauvery Beverages (demo); Western Ghats Foods (demo)", value_text="Cauvery Beverages; Western Ghats Foods", evidence_type="claim", source=src(page=2), confidence="high")],
  extraction_warnings=[])
json.dump(deccan, open(f"{OUT}/deccan.json", "w"), indent=1)

# ---- Pacific (Word, USD) ----
d = docx.Document("sample-data/responses/pacific/Pacific_Pack_Offer_RFQ-2026-0142.docx")
paras = [p.text for p in d.paragraphs]
def pn(sub):
    for i, t in enumerate(paras):
        if sub in t: return i + 1, t
def num_after(t, key):
    return float(re.search(re.escape(key) + r"[^\d]*([\d.]+)", t).group(1))
L = []
def add(n, text, price, para, snippet, basis="per_unit", qty=None, uom="pc", conf="high", mc="high", cands=None, ev=None, notes=None):
    L.append(dict(raw_text=text, rfq_line_no=n, mapping_confidence=mc, candidate_line_nos=cands or [], uom=uom, unit_price=price, currency="USD", price_basis=basis,
                  basis_quantity=qty, pack_size_evidence=ev, confidence=conf, legibility="clear", notes=notes, source=src(paragraph=para), source_snippet=snippet))
i, t = pn("For the 3-ply range")
usd = [float(x) for x in re.findall(r"USD ([\d.]+)", t)]
add(1, "3-ply 250x200x150 mm", usd[0], i, f"USD {usd[0]} per piece for 250x200x150 mm")
add(2, "3-ply 300x200x150 mm printed", usd[1], i, f"USD {usd[1]} for the 300x200x150 mm printed carton")
add(3, "3-ply 350x250x200 mm", usd[2], i, f"USD {usd[2]} for 350x250x200 mm")
add(4, "3-ply 400x300x200 mm", usd[3], i, f"USD {usd[3]} for 400x300x200 mm")
add(5, "e-commerce carton 200x150x100 mm", usd[4], i, f"(200x150x100 mm) is USD {usd[4]} per thousand pieces", basis="per_n_units", qty=1000)
add(6, "450x350x250 mm C-flute", usd[5], i, f"450x350x250 mm C-flute carton is USD {usd[5]} per piece")
i, t = pn("In 5-ply we offer")
u = [float(x) for x in re.findall(r"USD ([\d.]+)", t)]
for n, k, s in [(7, 0, "400x300x300"), (9, 1, "500x400x300"), (10, 2, "600x400x400"), (11, 3, "2-colour 350x300x250"), (12, 4, "550x450x350")]:
    add(n, f"5-ply {s} mm", u[k], i, f"{s} mm at USD {u[k]}")
i, t = pn("heavy-duty 450x300x300")
u = [float(x) for x in re.findall(r"USD ([\d.]+)", t)]
add(8, "heavy-duty 450x300x300 mm carton (ply not stated)", u[0], i, f"For the heavy-duty 450x300x300 mm carton we can offer USD {u[0]} per piece", mc="low", cands=[8, 14], conf="medium",
    notes="Ply not stated: size matches L8 (5-ply master carton) and L14 (7-ply export carton).")
add(13, "7-ply 600x500x500 mm heavy-duty", u[1], i, f"7-ply 600x500x500 mm heavy-duty carton is USD {u[1]} per piece")
tbl = d.tables[0]
tmap = {"Mailer 300x220x80": 15, "Mailer 220x160x60": 16, "Tray": 17, "Partition 12": 18, "Partition 24": 19, "Partition 6": 20, "Layer pad": 21, "Single-face roll": 22}
for ri, row in enumerate(tbl.rows[1:], start=2):
    name, price, basis = [c.text for c in row.cells]
    n = next(v for k, v in tmap.items() if name.startswith(k))
    add(n, name, float(price), None, f"{name} | {price} | {basis}", uom=basis.replace("per ", ""))
    L[-1]["source"] = src(region=f"table 1 row {ri}")
i, t = pn("Clear BOPP tape")
u = [float(x) for x in re.findall(r"USD ([\d.]+)", t)]
add(25, "Clear BOPP tape 48 mm x 65 m", u[0], i, f"USD {u[0]} per box; each carton box contains 36 rolls", basis="per_pack", qty=36, uom="box", ev="each carton box contains 36 rolls")
add(26, "Printed 72 mm x 65 m logo tape", u[1], i, f"Printed 72 mm x 65 m logo tape is USD {u[1]} per box", basis="per_pack", qty=None, uom="box", conf="medium", notes="Pack size for 72 mm tape not stated.")
add(27, "Hand stretch film 23 mic", u[2], i, f"USD {u[2]}/kg", basis="per_kg", uom="kg")
add(28, "Machine film 17 mic", u[3], i, f"USD {u[3]}/kg", basis="per_kg", uom="kg")
pacific = dict(document_overview="Word offer letter; prices in USD inside paragraphs and one table; delivered Hosur, duties included, GST extra.", currency={"code": "USD", "evidence": "All prices below are in US Dollars (USD)"},
  tax={"treatment": "exclusive", "rate_percent": None, "text": "exclusive of Indian GST"}, freight={"type": "included", "text": "delivered to your Hosur DC, inclusive of import duties", "source": src(paragraph=6)},
  payment_terms={"text": "30 days from bill of lading against irrevocable LC", "days": 30}, validity_days=45, lead_time={"days": 21, "text": "21 days from PO"}, discounts=[], unresolved_references=[],
  other_notes=["Not quoted this round: edge protectors, pallet sleeves, void-fill rolls.", "Exchange-rate risk stays with the buyer; invoices in USD."], lines=L,
  questionnaire=[
    dict(q_no=1, raw_answer="Yes, our Singapore plant is ISO 9001:2015 certified (certificate to follow).", value_bool=True, evidence_type="claim", source=src(paragraph=pn("1. ISO")[0]), confidence="high"),
    dict(q_no=2, raw_answer="Yes, third-party SGS reports per shipment.", value_bool=True, evidence_type="claim", source=src(paragraph=pn("2. BCT")[0]), confidence="high"),
    dict(q_no=3, raw_answer="500 tonnes per month across our regional network.", value_number=500, evidence_type="claim", source=src(paragraph=pn("3. Capacity")[0]), confidence="high"),
    dict(q_no=4, raw_answer="21 days to Hosur DC.", value_number=21, evidence_type="claim", source=src(paragraph=pn("4. Lead")[0]), confidence="high"),
    dict(q_no=5, raw_answer="Not possible; LC 30 days.", value_bool=False, evidence_type="claim", confidence="high"),
    dict(q_no=6, raw_answer="Yes, FSC-certified board available as standard.", value_bool=True, evidence_type="claim", confidence="high"),
    dict(q_no=7, raw_answer="Chennai warehouse is approx. 280 km from Hosur.", value_number=280, evidence_type="claim", confidence="high"),
    dict(q_no=8, raw_answer="Straits Confectionery (demo); Lion City Foods (demo).", value_text="Straits Confectionery; Lion City Foods", evidence_type="claim", confidence="high")],
  extraction_warnings=[])
json.dump(pacific, open(f"{OUT}/pacific.json", "w"), indent=1)

# ---- Hosur Box Works (photo) ----
rc = [(1, "3 Ply Box 250x200x150", 10.4), (2, "3 Ply Box 300x200x150 (1 col)", 13.3), (3, "3 Ply Box 350x250x200", 18.2), (4, "3 Ply Box 400x300x200", 22.3), (5, "3 Ply Box 200x150x100", 6.3),
      (7, "5 Ply Box 400x300x300", 34.1), (8, "5 Ply Box 450x300x300", 41.2), (9, "5 Ply Box 500x400x300", 50.3), (10, "5 Ply Box 600x400x400", 69.3), (11, "5 Ply Box 350x300x250 (2 col)", 35.5),
      (13, "7 Ply Box 600x500x500", 140.0), (16, "Mailer E-flute 220x160x60", 9.1)]
HL = [dict(raw_text=t, rfq_line_no=n, mapping_confidence="high", candidate_line_nos=[], uom="pc", unit_price=p, currency="INR", price_basis="per_unit", confidence="high" if r < 10 else "medium",
           legibility="clear", source=src(region=f"rate table row {r}"), source_snippet=f"{t} | {p} | pc") for r, (n, t, p) in enumerate(rc, 1)]
HL.append(dict(raw_text="Partition 12 cell", rfq_line_no=18, mapping_confidence="high", uom="bundle of 50 sets", unit_price=438, currency="INR", price_basis="per_pack", basis_quantity=50,
               pack_size_evidence="PER: bundle of 50 sets", confidence="medium", legibility="clear", source=src(region="rate table row 13"), source_snippet="Partition 12 cell | 438 | bundle of 50 sets"))
HL.append(dict(raw_text="Partition 6 cell", rfq_line_no=20, mapping_confidence="high", uom="bundle of 50 sets", unit_price=284, currency="INR", price_basis="per_pack", basis_quantity=50,
               pack_size_evidence="PER: bundle of 50 sets", confidence="medium", legibility="partial", notes="Row partly in shadow; digits legible.", source=src(region="rate table row 14"), source_snippet="Partition 6 cell | 284 | bundle of 50 sets"))
for n, t, r in [(21, "Layer Pad 1200x1000", 15), (23, "Edge Protector 50x50x5 1m", 16), (24, "Edge Protector 35x35x3 0.8m", 17), (29, "Pallet Sleeve 1200x1000x1000", 18)]:
    HL.append(dict(raw_text=t, rfq_line_no=n, mapping_confidence="high", uom=None, unit_price=None, currency="INR", price_basis="unknown", confidence="low", legibility="unreadable",
                   notes="Rate and unit blurred/shadowed in the photo; not guessed.", source=src(region=f"rate table row {r}, lower right (shadow/blur)"), source_snippet=f"{t} | [blurred] | [blurred]"))
hosur = dict(document_overview="Phone photo of a printed rate card, angled and shadowed; lower rows blurred.", currency={"code": "INR"}, tax={"treatment": "inclusive", "rate_percent": 18, "text": "INCLUSIVE of GST 18%"},
  freight={"type": "included", "text": "delivered Hosur", "source": src(region="header")}, discounts=[], unresolved_references=[],
  other_notes=["Printing extra @ Rs 0.80 per colour per box (applies to printed lines L2, L11).", "Rates subject to paper price change."], lines=HL, questionnaire=[],
  extraction_warnings=["4 rates in the lower-right of the photo are unreadable due to shadow and blur.", "No questionnaire answers in a rate card."])
json.dump(hosur, open(f"{OUT}/hosur-box.json", "w"), indent=1)
print(len(lines), len(L), len(HL))
