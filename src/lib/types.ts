export type Rfq = {
  id: string;
  org_id: string;
  ref_code: string;
  title: string;
  description: string | null;
  category: string | null;
  status: "draft" | "sent" | "collecting" | "evaluating" | "decided" | "cancelled";
  currency: string;
  currency_policy: CurrencyPolicy;
  response_deadline: string | null;
  required_by: string | null;
  delivery_location: string | null;
  commercial_terms: Record<string, any>;
  evaluation_rules: { criteria?: { name: string; weight: number }[]; qualification?: string };
  ai_draft: boolean;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
};

export type CurrencyPolicy = {
  base?: string;
  policy?: string;
  rates?: Record<string, { rate: number; as_of: string; source: string }>;
};

export type RfqLine = {
  id: string;
  rfq_id: string;
  line_no: number;
  description: string;
  specification: string | null;
  quantity: number;
  uom: string;
  category: string | null;
  required_by: string | null;
};

export type RfqQuestion = {
  id: string;
  rfq_id: string;
  q_no: number;
  question: string;
  answer_type: "yes_no" | "number" | "text";
  must_pass: boolean;
  pass_rule: { op: "eq" | "gte" | "lte"; value: any } | null;
  requires_evidence: boolean;
};

export type Supplier = {
  id: string;
  name: string;
  short_code: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  is_demo: boolean;
};

export type RfqSupplier = {
  id: string;
  rfq_id: string;
  supplier_id: string;
  channel: string;
  delivery_status: "not_sent" | "sent" | "delivered" | "bounced";
  response_status: "awaiting" | "responded" | "declined";
  invited_at: string | null;
  delivered_at: string | null;
  last_response_at: string | null;
  message_subject: string | null;
  message_body: string | null;
};

export type ResponseStatus = "received" | "parsing" | "extracting" | "normalizing" | "needs_review" | "ready" | "failed";

export type SourceRef = {
  file?: string;
  page?: number | null;
  sheet?: string | null;
  cell?: string | null;
  row?: number | null;
  paragraph?: number | null;
  region?: string | null;
};

export type FreightTerm = {
  type: "included" | "extra_percent" | "extra_amount" | "extra_unquantified" | "not_stated";
  percent?: number | null;
  amount?: number | null;
  text?: string | null;
  source?: SourceRef | null;
};

export type ResponseTerms = {
  currency?: string | null;
  currency_evidence?: string | null;
  tax_treatment?: "exclusive" | "inclusive" | "not_stated";
  tax_rate_percent?: number | null;
  tax_text?: string | null;
  freight?: FreightTerm;
  payment_terms?: string | null;
  payment_days?: number | null;
  validity_days?: number | null;
  lead_time_days?: number | null;
  lead_time_text?: string | null;
  discounts?: { description: string; percent: number | null; conditional: boolean; condition?: string | null; source?: SourceRef | null }[];
  unresolved_references?: { text: string; source?: SourceRef | null }[];
  other_notes?: string[];
  quote_reference?: string | null;
  quote_date?: string | null;
  supersedes_note?: string | null;
};

export type SupplierResponse = {
  id: string;
  rfq_id: string;
  supplier_id: string;
  version: number;
  is_active: boolean;
  supersedes_id: string | null;
  channel: string;
  received_at: string;
  status: ResponseStatus;
  status_detail: string | null;
  error: string | null;
  terms: ResponseTerms;
  summary: Record<string, any>;
  email_subject: string | null;
  email_body: string | null;
  created_at: string;
};

export type SourceFile = {
  id: string;
  response_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  file_kind: "quote" | "attachment" | "email_body";
  detected_format: string | null;
  size_bytes: number | null;
  sha256: string | null;
  processing_state: string;
  created_at: string;
};

export type PriceBasis = "per_unit" | "per_n_units" | "per_pack" | "per_kg" | "lump_sum" | "unknown";

export type ExtractedLine = {
  id: string;
  response_id: string;
  run_id: string | null;
  source_file_id: string | null;
  seq: number;
  raw_text: string | null;
  raw_description: string | null;
  raw_item_code: string | null;
  mapped_line_id: string | null;
  mapping_confidence: "high" | "medium" | "low" | "none" | null;
  mapping_candidates: { line_no: number; reason?: string }[] | null;
  mapping_rationale: string | null;
  raw_quantity: number | null;
  raw_uom: string | null;
  raw_unit_price: number | null;
  raw_currency: string | null;
  raw_price_basis: PriceBasis | null;
  raw_basis_quantity: number | null;
  pack_size_evidence: string | null;
  raw_extended_price: number | null;
  raw_tax_note: string | null;
  lead_time_text: string | null;
  notes: string | null;
  confidence: "high" | "medium" | "low" | null;
  legibility: "clear" | "partial" | "unreadable" | null;
  source_location: SourceRef | null;
  source_snippet: string | null;
  flags: string[];
};

export type NormalizedLine = {
  id?: string;
  response_id: string;
  extracted_line_id: string;
  rfq_line_id: string | null;
  supplier_id: string;
  normalized_uom: string | null;
  units_per_quoted_unit: number | null;
  unit_price_quoted_ccy: number | null;
  quote_currency: string | null;
  fx_rate: number | null;
  fx_as_of: string | null;
  fx_source: string | null;
  tax_treatment: string | null;
  unit_price_base: number | null;
  extended_price_base: number | null;
  status: "comparable" | "needs_review" | "excluded";
  status_reason: string | null;
  rules_applied: string[];
  has_override: boolean;
};

export type Override = {
  id: string;
  response_id: string;
  extracted_line_id: string | null;
  field: OverrideField;
  original_value: any;
  new_value: any;
  reason: string;
  is_active: boolean;
  user_email: string | null;
  created_at: string;
};

export type OverrideField =
  | "mapped_line_id"
  | "raw_unit_price"
  | "raw_price_basis"
  | "raw_basis_quantity"
  | "raw_currency"
  | "tax_inclusive"
  | "exclude"
  | "choose_in_conflict";

export type QuestionnaireAnswer = {
  id: string;
  response_id: string;
  question_id: string;
  raw_answer: string | null;
  normalized_value: { bool?: boolean | null; number?: number | null; unit?: string | null; text?: string | null } | null;
  evidence_type: "claim" | "document_attached" | "none" | null;
  evidence_snippet: string | null;
  source_location: SourceRef | null;
  confidence: string | null;
  review_status: "unverified" | "verified" | "rejected" | "missing";
  review_note: string | null;
};

export type ExceptionRow = {
  id?: string;
  rfq_id: string;
  response_id: string | null;
  supplier_id: string | null;
  fingerprint: string;
  type: string;
  severity: "critical" | "warning" | "info";
  title: string;
  explanation: string | null;
  field: string | null;
  rfq_line_id: string | null;
  extracted_line_id: string | null;
  suggested_resolution: string | null;
  status?: "open" | "resolved" | "accepted_risk";
  resolution_note?: string | null;
};
