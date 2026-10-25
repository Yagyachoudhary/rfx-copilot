-- =====================================================================
-- RFx Copilot — database schema
-- Run once in the Supabase SQL editor (or `supabase db push`).
-- Every business record is scoped to an organization and protected by RLS.
-- Raw extraction, normalized values and buyer overrides live in separate
-- tables so the audit trail is always recoverable.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Tenancy
-- ---------------------------------------------------------------------
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  plan text not null default 'growth',          -- growth | enterprise (theme matching is an enterprise feature)
  is_demo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.memberships (
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'buyer' check (role in ('admin','buyer','viewer')),
  full_name text,
  email text,
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index if not exists memberships_user_idx on public.memberships(user_id);

-- Helper used by every RLS policy. SECURITY DEFINER avoids recursive RLS on memberships.
create or replace function public.my_org_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$ select org_id from public.memberships where user_id = auth.uid() $$;

create or replace function public.is_org_admin(p_org uuid)
returns boolean
language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.memberships where user_id = auth.uid() and org_id = p_org and role = 'admin') $$;

-- Bootstrap: a signed-in user creates their own workspace and becomes its admin.
create or replace function public.create_organization(p_name text, p_full_name text default null)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_org uuid; v_email text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select email into v_email from auth.users where id = auth.uid();
  insert into public.organizations(name) values (p_name) returning id into v_org;
  insert into public.memberships(org_id, user_id, role, full_name, email)
    values (v_org, auth.uid(), 'admin', p_full_name, v_email);
  return v_org;
end $$;
grant execute on function public.create_organization(text, text) to authenticated;

-- ---------------------------------------------------------------------
-- Suppliers and RFx
-- ---------------------------------------------------------------------
create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  short_code text,
  contact_name text,
  email text,
  phone text,
  location text,
  notes text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists suppliers_org_idx on public.suppliers(org_id);

create table if not exists public.rfqs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  ref_code text not null,
  title text not null,
  description text,
  category text,
  status text not null default 'draft' check (status in ('draft','sent','collecting','evaluating','decided','cancelled')),
  currency text not null default 'INR',
  currency_policy jsonb not null default '{}'::jsonb,   -- {base, rates:{USD:{rate,as_of,source}}, policy}
  response_deadline date,
  required_by date,
  delivery_location text,
  commercial_terms jsonb not null default '{}'::jsonb,  -- {payment_terms, incoterms, tax, freight, validity_days, notes}
  evaluation_rules jsonb not null default '{}'::jsonb,  -- {criteria:[{name,weight}], qualification:'all must-pass questions'}
  ai_draft boolean not null default false,
  is_demo boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists rfqs_org_idx on public.rfqs(org_id);

create table if not exists public.rfq_line_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  rfq_id uuid not null references public.rfqs(id) on delete cascade,
  line_no int not null,
  description text not null,
  specification text,
  quantity numeric not null,
  uom text not null,
  category text,
  required_by date,
  unique (rfq_id, line_no)
);
create index if not exists rli_rfq_idx on public.rfq_line_items(rfq_id);

create table if not exists public.rfq_questions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  rfq_id uuid not null references public.rfqs(id) on delete cascade,
  q_no int not null,
  question text not null,
  answer_type text not null default 'yes_no' check (answer_type in ('yes_no','number','text')),
  must_pass boolean not null default false,
  pass_rule jsonb,              -- {"op":"eq","value":true} | {"op":"gte","value":500} | {"op":"lte","value":10}
  requires_evidence boolean not null default false,
  unique (rfq_id, q_no)
);

create table if not exists public.rfq_suppliers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  rfq_id uuid not null references public.rfqs(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  channel text not null default 'email_simulated',
  delivery_status text not null default 'not_sent' check (delivery_status in ('not_sent','sent','delivered','bounced')),
  response_status text not null default 'awaiting' check (response_status in ('awaiting','responded','declined')),
  invited_at timestamptz,
  delivered_at timestamptz,
  last_response_at timestamptz,
  message_subject text,
  message_body text,
  unique (rfq_id, supplier_id)
);

-- ---------------------------------------------------------------------
-- Responses, files and processing runs
-- ---------------------------------------------------------------------
create table if not exists public.supplier_responses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  rfq_id uuid not null references public.rfqs(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  version int not null default 1,
  is_active boolean not null default true,
  supersedes_id uuid references public.supplier_responses(id),
  channel text not null default 'email',
  received_at timestamptz not null default now(),
  status text not null default 'received' check (status in ('received','parsing','extracting','normalizing','needs_review','ready','failed')),
  status_detail text,
  error text,
  terms jsonb not null default '{}'::jsonb,      -- header-level extracted terms with sources (raw, never edited)
  summary jsonb not null default '{}'::jsonb,    -- counts computed after normalization
  email_subject text,
  email_body text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists sr_rfq_idx on public.supplier_responses(rfq_id);

create table if not exists public.source_files (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  response_id uuid not null references public.supplier_responses(id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  mime_type text,
  file_kind text not null default 'quote' check (file_kind in ('quote','attachment','email_body')),
  detected_format text,          -- xlsx | csv | pdf | docx | image | email
  size_bytes bigint,
  sha256 text,
  processing_state text not null default 'uploaded',
  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists sf_resp_idx on public.source_files(response_id);

create table if not exists public.extraction_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  response_id uuid not null references public.supplier_responses(id) on delete cascade,
  model text,
  extraction_version text not null default 'v1',
  status text not null default 'running' check (status in ('running','succeeded','failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  input_tokens int,
  output_tokens int,
  parser_notes jsonb,
  raw_output jsonb,
  error text
);

create table if not exists public.extracted_quote_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  response_id uuid not null references public.supplier_responses(id) on delete cascade,
  run_id uuid references public.extraction_runs(id) on delete set null,
  source_file_id uuid references public.source_files(id) on delete set null,
  seq int not null,
  raw_text text,
  raw_description text,
  raw_item_code text,
  mapped_line_id uuid references public.rfq_line_items(id),
  mapping_confidence text check (mapping_confidence in ('high','medium','low','none')),
  mapping_candidates jsonb,          -- [{line_no, reason}]
  mapping_rationale text,
  raw_quantity numeric,
  raw_uom text,
  raw_unit_price numeric,
  raw_currency text,
  raw_price_basis text,              -- per_unit | per_n_units | per_pack | per_kg | per_roll | lump_sum | unknown
  raw_basis_quantity numeric,        -- N for per_n_units / pack size for per_pack when stated
  pack_size_evidence text,
  raw_extended_price numeric,
  raw_tax_note text,
  lead_time_text text,
  notes text,
  confidence text check (confidence in ('high','medium','low')),
  legibility text,                   -- clear | partial | unreadable
  source_location jsonb,             -- {file, page, sheet, cell, row, paragraph, region}
  source_snippet text,
  flags text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists eql_resp_idx on public.extracted_quote_lines(response_id);

create table if not exists public.normalized_quote_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  response_id uuid not null references public.supplier_responses(id) on delete cascade,
  extracted_line_id uuid not null references public.extracted_quote_lines(id) on delete cascade,
  rfq_line_id uuid references public.rfq_line_items(id),
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  normalized_uom text,
  units_per_quoted_unit numeric,     -- divisor applied to the quoted price
  unit_price_quoted_ccy numeric,     -- per requested UOM, in quote currency
  quote_currency text,
  fx_rate numeric,
  fx_as_of date,
  fx_source text,
  tax_treatment text,                -- exclusive | inclusive_converted | unknown
  unit_price_base numeric,           -- per requested UOM, base currency, ex-tax
  extended_price_base numeric,       -- unit_price_base * RFQ quantity
  status text not null check (status in ('comparable','needs_review','excluded')),
  status_reason text,
  rules_applied text[] not null default '{}',
  has_override boolean not null default false,
  computed_at timestamptz not null default now(),
  unique (extracted_line_id)
);
create index if not exists nql_resp_idx on public.normalized_quote_lines(response_id);

create table if not exists public.questionnaire_answers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  response_id uuid not null references public.supplier_responses(id) on delete cascade,
  question_id uuid not null references public.rfq_questions(id) on delete cascade,
  raw_answer text,
  normalized_value jsonb,            -- {"bool":true} | {"number":600,"unit":"t/month"} | {"text":"..."}
  evidence_type text,                -- claim | document_attached | none
  evidence_snippet text,
  source_location jsonb,
  confidence text,
  review_status text not null default 'unverified' check (review_status in ('unverified','verified','rejected','missing')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  review_note text,
  unique (response_id, question_id)
);

create table if not exists public.exceptions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  rfq_id uuid not null references public.rfqs(id) on delete cascade,
  response_id uuid references public.supplier_responses(id) on delete cascade,
  supplier_id uuid references public.suppliers(id) on delete cascade,
  fingerprint text not null,
  type text not null,
  severity text not null check (severity in ('critical','warning','info')),
  title text not null,
  explanation text,
  field text,
  rfq_line_id uuid references public.rfq_line_items(id),
  extracted_line_id uuid references public.extracted_quote_lines(id) on delete cascade,
  suggested_resolution text,
  status text not null default 'open' check (status in ('open','resolved','accepted_risk')),
  resolved_by uuid references auth.users(id),
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now(),
  unique (response_id, fingerprint)
);
create index if not exists exc_rfq_idx on public.exceptions(rfq_id);

create table if not exists public.buyer_overrides (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  response_id uuid not null references public.supplier_responses(id) on delete cascade,
  extracted_line_id uuid references public.extracted_quote_lines(id) on delete cascade,
  field text not null,               -- mapped_line_id | raw_unit_price | raw_price_basis | raw_basis_quantity | raw_currency | exclude | tax_inclusive
  original_value jsonb,
  new_value jsonb,
  reason text not null,
  is_active boolean not null default true,
  user_id uuid references auth.users(id),
  user_email text,
  created_at timestamptz not null default now()
);
create index if not exists bo_resp_idx on public.buyer_overrides(response_id);

create table if not exists public.audit_events (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  rfq_id uuid references public.rfqs(id) on delete cascade,
  actor_id uuid references auth.users(id),
  actor_email text,
  action text not null,
  entity_type text,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_rfq_idx on public.audit_events(rfq_id, created_at desc);

create table if not exists public.analyst_messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  rfq_id uuid not null references public.rfqs(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  artifacts jsonb not null default '[]'::jsonb,   -- [{type:'sql'|'table'|'chart'|'export', ...}]
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists am_rfq_idx on public.analyst_messages(rfq_id, created_at);

create table if not exists public.award_decisions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  rfq_id uuid not null references public.rfqs(id) on delete cascade,
  scenario_key text not null,
  scenario jsonb not null,
  assumptions jsonb not null default '{}'::jsonb,
  rationale text,
  status text not null default 'draft' check (status in ('draft','buyer_confirmed','withdrawn')),
  decided_by uuid references auth.users(id),
  decided_by_email text,
  created_at timestamptz not null default now()
);

create table if not exists public.organization_theme (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  version int not null,
  label text,
  tokens jsonb not null,
  mode text not null default 'light' check (mode in ('light','dark')),
  logo_path text,
  source_image_path text,
  ai_rationale text,
  status text not null default 'proposed' check (status in ('proposed','applied','archived')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  unique (org_id, version)
);

-- ---------------------------------------------------------------------
-- Row Level Security: every table is tenant-scoped through memberships.
-- ---------------------------------------------------------------------
alter table public.organizations enable row level security;
alter table public.memberships enable row level security;

drop policy if exists org_select on public.organizations;
create policy org_select on public.organizations for select using (id in (select public.my_org_ids()));
drop policy if exists org_update on public.organizations;
create policy org_update on public.organizations for update using (public.is_org_admin(id));

drop policy if exists mem_select on public.memberships;
create policy mem_select on public.memberships for select using (org_id in (select public.my_org_ids()));
drop policy if exists mem_admin on public.memberships;
create policy mem_admin on public.memberships for all using (public.is_org_admin(org_id)) with check (public.is_org_admin(org_id));

do $$
declare t text;
begin
  foreach t in array array[
    'suppliers','rfqs','rfq_line_items','rfq_questions','rfq_suppliers','supplier_responses',
    'source_files','extraction_runs','extracted_quote_lines','normalized_quote_lines',
    'questionnaire_answers','exceptions','buyer_overrides','audit_events','analyst_messages',
    'award_decisions','organization_theme'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists tenant_rw on public.%I', t);
    execute format(
      'create policy tenant_rw on public.%I for all using (org_id in (select public.my_org_ids())) with check (org_id in (select public.my_org_ids()))', t);
  end loop;
end $$;

-- Audit events and raw extraction are append-only for app users.
drop policy if exists tenant_rw on public.audit_events;
drop policy if exists audit_select on public.audit_events;
create policy audit_select on public.audit_events for select using (org_id in (select public.my_org_ids()));
drop policy if exists audit_insert on public.audit_events;
create policy audit_insert on public.audit_events for insert with check (org_id in (select public.my_org_ids()));

-- Theme changes are admin-only.
drop policy if exists tenant_rw on public.organization_theme;
drop policy if exists theme_select on public.organization_theme;
create policy theme_select on public.organization_theme for select using (org_id in (select public.my_org_ids()));
drop policy if exists theme_write on public.organization_theme;
create policy theme_write on public.organization_theme for all using (public.is_org_admin(org_id)) with check (public.is_org_admin(org_id));

-- ---------------------------------------------------------------------
-- Private storage buckets. Object paths start with the org id:
--   <org_id>/<rfq_id>/<response_id>/<sha>-<file name>
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('source-files', 'source-files', false), ('exports', 'exports', false), ('branding', 'branding', false)
on conflict (id) do nothing;

drop policy if exists "tenant objects read" on storage.objects;
create policy "tenant objects read" on storage.objects for select to authenticated
  using (bucket_id in ('source-files','exports','branding') and (storage.foldername(name))[1] in (select id::text from public.my_org_ids() as id));
drop policy if exists "tenant objects insert" on storage.objects;
create policy "tenant objects insert" on storage.objects for insert to authenticated
  with check (bucket_id in ('source-files','exports','branding') and (storage.foldername(name))[1] in (select id::text from public.my_org_ids() as id));
drop policy if exists "tenant objects update" on storage.objects;
create policy "tenant objects update" on storage.objects for update to authenticated
  using (bucket_id in ('source-files','exports','branding') and (storage.foldername(name))[1] in (select id::text from public.my_org_ids() as id));
