"""Builds sample-data/cached-extractions/ from real extraction outputs in scripts/out/.

The sample event's files never change, so the app reuses these saved readings instead of
calling the model each time (keyed by the SHA-256 of the exact files). Re-run after
regenerating outputs:  npx tsx scripts/test-pipeline.ts  then  python3 scripts/build-sample-cache.py
"""
import hashlib, json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "scripts", "out")
DEST = os.path.join(ROOT, "sample-data", "cached-extractions")
manifest = json.load(open(os.path.join(ROOT, "sample-data", "demo-rfq.json")))
version = re.search(r'EXTRACTION_VERSION = "([^"]+)"', open(os.path.join(ROOT, "src/lib/ai/extract.ts")).read()).group(1)

def flatten(o):
    """Older outputs used nested header objects; store the flat shape the schema uses now."""
    o = dict(o)
    def take(key, mapping):
        v = o.pop(key, None)
        if isinstance(v, dict):
            for src, dst in mapping.items():
                if dst not in o or o[dst] is None:
                    o[dst] = v.get(src)
    take("currency", {"code": "currency_code", "evidence": "currency_evidence"})
    take("tax", {"treatment": "tax_treatment", "rate_percent": "tax_rate_percent", "text": "tax_text"})
    take("freight", {"type": "freight_type", "percent": "freight_percent", "amount": "freight_amount", "text": "freight_text", "source": "freight_where"})
    take("payment_terms", {"text": "payment_terms_text", "days": "payment_days"})
    take("lead_time", {"days": "lead_time_days", "text": "lead_time_text"})
    w = o.get("freight_where")
    if isinstance(w, dict):  # readable location, as the flat schema asks for
        bits = [f"p.{w['page']}" if w.get("page") else None,
                f"{w['sheet']}!{w['cell']}" if w.get("sheet") and w.get("cell") else (w.get("sheet") or w.get("cell")),
                f"¶{w['paragraph']}" if w.get("paragraph") else None, w.get("region")]
        o["freight_where"] = ", ".join(b for b in bits if b) or None
    for k in ("validity_days", "payment_days", "lead_time_days"):
        if isinstance(o.get(k), str) and o[k].strip().isdigit():
            o[k] = int(o[k])
    return o

os.makedirs(DEST, exist_ok=True)
index = []
for s in manifest["sample_responses"]:
    rid = f"{s['supplier']}-v{s['version']}"
    src = os.path.join(OUT, f"{rid}.json")
    if not os.path.exists(src):
        print("missing", rid); continue
    shas = sorted(hashlib.sha256(open(os.path.join(ROOT, "sample-data", f["path"]), "rb").read()).hexdigest() for f in s["files"])
    out = flatten(json.load(open(src))["output"])
    json.dump(out, open(os.path.join(DEST, f"{rid}.json"), "w"), indent=1)
    index.append({"id": rid, "file_sha256": shas, "extraction_version": version})
    print("cached", rid, len(out.get("lines", [])), "lines")
json.dump({"note": "Saved real model readings of the fixed sample files. Used only for demo events whose lines match the sample manifest.",
           "line_signature": hashlib.sha256(json.dumps(sorted([[l["line_no"], l["description"]] for l in manifest["lines"]]), separators=(",", ":"), ensure_ascii=False).encode()).hexdigest(),
           "entries": index}, open(os.path.join(DEST, "index.json"), "w"), indent=1)
