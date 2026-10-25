# RFx Copilot

**Kill the quote spreadsheet.** A buyer drafts an RFx with an AI co-pilot, "sends" it, receives supplier replies in whatever
shape they arrive (Excel that ignores the template, PDF on letterhead with footnotes, Word paragraphs in USD, an angled
phone photo of a rate card, a one-line email), and gets a single comparison — same lines, same units, same currency —
with every number traceable to its source. Then the buyer asks questions in plain language and records a decision.

> All buyer, supplier, people, certificate and price data in this repo is **fictional**. Email delivery is simulated.
> Extraction, normalization, exceptions, comparison and analyst answers run live on the documents.

## What is real vs simulated

| Real | Simulated / stubbed |
|---|---|
| Supabase Auth, Postgres with RLS tenant isolation, private Storage | Email/portal delivery of RFx invitations (recorded with timestamps, nothing is sent) |
| File parsing: xlsx (cell coordinates), docx (paragraph numbers), eml/txt (line numbers), PDF + images via Claude document/vision input | Supplier "arrival" in the demo: a button replays a sample document as a received response |
| Claude extraction to a strict schema with raw values, mapping, confidence, source refs | FX: a buyer-set fixed rate per RFx (no live FX feed) |
| Deterministic normalization (units, pack sizes, currency, GST) + exceptions in TypeScript | |
| Analyst: Claude tool-use agent that answers only via read-only SQL over a snapshot of current data | |
| Buyer overrides, version history, audit trail, XLSX/CSV exports, theme tokens per org | |

## Architecture

```
Browser (Next.js 15 App Router, React 19, Tailwind tokens)
   │  server components read via the user's Supabase session (RLS)
   ▼
Next.js route handlers on Vercel  ── after() background processing, status polled from DB
   │                       │
   │                       ├─ parsers: exceljs · mammoth · sharp (EXIF rotate/resize)
   │                       ├─ Claude (Anthropic API): extraction · RFx draft · analyst (tools) · theme vision
   │                       └─ deterministic core: normalize.ts · exceptions.ts · compare.ts · qualification.ts
   ▼
Supabase: Postgres (RLS on every table) + Storage (private buckets: source-files, exports, branding)
```

Key design choices:

- **The model reads; code decides.** Claude returns *raw* values exactly as quoted plus where it found them. Unit,
  pack-size, currency and tax conversions are explicit rules in `src/lib/normalize.ts`, applied only with evidence.
- **Three layers, never merged:** `extracted_quote_lines` (raw, immutable) → `buyer_overrides` (who/why) →
  `normalized_quote_lines` (recomputed). Reverting an override restores the extracted value.
- **Missing ≠ zero.** Missing lines are counted and shown as hatched cells; totals over different line sets are labelled as
  non-comparable; scenario totals say "incomplete" when lines are unpriced or freight is unknown.
- **Analyst is grounded by construction.** It can only call `run_sql` (read-only SQLite snapshot of the current RFx),
  `make_chart` (data from a query) and `export_table`. Every query is shown in the UI.
- **No auto-award.** The decision workspace computes scenarios; the buyer writes the rationale and confirms. The server
  recomputes the scenario from persisted data rather than trusting the browser.

## Local setup

```bash
npm install
cp .env.example .env.local   # fill in Supabase + Anthropic keys
npm run dev
```

### Environment variables

| Name | Where | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API (anon / publishable key) | RLS protects data; no service-role key is used |
| `ANTHROPIC_API_KEY` | console.anthropic.com | Server-only |
| `AI_MODEL_EXTRACTION`, `AI_MODEL_ANALYST`, `AI_MODEL_FAST` | optional | default `claude-sonnet-5-5` / `claude-sonnet-5-5` / `claude-haiku-5-5` |
| `DEMO_FX_USD_INR`, `DEMO_FX_AS_OF` | optional | default USD→INR rate for new RFx (editable per RFx) |

### Supabase setup (once)

1. Create a project at supabase.com.
2. SQL Editor → paste and run `supabase/migrations/0001_schema.sql` (idempotent; creates tables, RLS policies,
   the `create_organization` RPC, and three private storage buckets with tenant-scoped policies).
3. Authentication → Providers → Email: for a frictionless demo, turn **off** "Confirm email" (or keep it on and confirm
   via the email link). Authentication → URL Configuration: set Site URL to your Vercel URL.

## Deploy to Vercel

1. Push this repo to GitHub, then Vercel → Add New Project → import it (framework: Next.js, defaults are fine).
2. Add the environment variables above for **Production** and **Preview** (use a separate Supabase project for preview if
   you want isolated data).
3. Deploy. Long-running routes declare `maxDuration` (≤300 s) — supported on Vercel with Fluid compute (default).

## Demo script (≈8 minutes)

1. Sign up → "Set up your workspace" with **Load the demo sourcing event** ticked.
2. **Responses** tab → *Receive all 5 demo responses*. Watch states move: parsing → extracting → normalizing → needs review.
3. Open each supplier's **Review extraction**:
   - Shree Balaji (Excel): `per 100 Nos` converted ÷100; a duplicated master-carton line flagged as a **conflict**;
     item 3 priced at ₹1.6x is flagged as a **price outlier** vs peers (decimal typo).
   - Deccan (PDF): 27/30 lines — 3 missing stay missing; discount and freight found in **footnotes**; ISO certificate
     attached but **unverified** until a buyer checks it.
   - Pacific (Word, USD): converted at the RFx rate (shown everywhere); 48 mm tape "per box, 36 rolls" converted with
     evidence; 72 mm tape "per box" **without pack size** → needs review; an ambiguous "heavy-duty 450×300×300"
     (5-ply or 7-ply?) shown with candidates rather than forced; fails the ≤14-day lead-time must-pass.
   - Hosur Box Works (angled photo): GST-inclusive rates converted to ex-GST; blurred rows returned as **unreadable**
     instead of guessed; no questionnaire → incomplete qualification.
   - Sri Lakshmi (email): ₹/kg box prices can't be compared per piece without box weights; "rest same as last year"
     is an **unresolvable reference**; freight extra, unquantified.
4. Back on **Responses**, *Receive corrected v2* for Shree Balaji → new active version, typo and conflict gone, v1 kept.
5. **Compare** → hatched missing cells, review cells, FX/override icons; click any cell for raw → rule → source.
   Common-basket comparison shows the only like-for-like total.
6. **Analyst** → ask the VP's question: *"What if we split it — cheapest per line, but only among vendors who cleared the
   quality questionnaire?"* Expand the SQL to show how it was computed. Ask for an export.
7. **Decision** → compare presets, toggle freight / qualified-only / conditional discounts, draft rationale with AI,
   confirm. Check **Activity** for the audit trail.
8. **Settings → Brand & appearance** → upload a portal screenshot → AI-proposed tokens → edit → contrast checks →
   preview → apply (versioned, per org).

## Tests and checks

```bash
npm run typecheck && npm run lint && npm test && npm run build
# Live AI check on the sample documents (no database needed):
ANTHROPIC_API_KEY=... npx tsx scripts/test-pipeline.ts --analyst "Which suppliers quoted fewer than 30 lines?"
```

`scripts/generate_demo_data.py` regenerates the fictional vendor documents in `sample-data/` (Python: openpyxl,
reportlab, python-docx, Pillow, OpenCV).

## Known limitations (prototype)

- Processing runs in `after()` inside the request's function budget (≤300 s) with DB status as the queue — fine for a
  demo; production needs a durable queue (retries, concurrency limits, idempotency keys).
- Large documents are sent in one extraction call; very long PDFs (>100 pages) would need chunking + merge.
- `.xls` / `.doc` legacy formats and password-protected files are rejected with a clear error.
- FX is a buyer-set fixed rate per RFx; production should snapshot a treasury rate with source + timestamp.
- Re-running extraction replaces previous extracted lines (and their overrides) for that response; runs and audit
  events are kept. Production should diff runs and carry overrides forward.
- No role-based permissions beyond admin (theme) vs member; no SSO; no supplier-side portal.
- Confidence is the model's self-assessment — used as a review aid, not a guarantee. An eval set with labelled
  quotes is the next step before trusting it.
