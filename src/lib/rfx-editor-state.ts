export type EditorLine = { line_no?: number; description: string; specification: string; quantity: number | string; uom: string; category: string };
export type EditorQuestion = { question: string; answer_type: "yes_no" | "number" | "text"; must_pass: boolean; pass_op: "eq" | "gte" | "lte" | "" | null; pass_value: any; requires_evidence: boolean };
export type EditorState = {
  title: string;
  description: string;
  category: string;
  currency: string;
  response_deadline: string;
  required_by: string;
  delivery_location: string;
  commercial_terms: { price_basis?: string; tax?: string; payment_terms?: string; validity_days?: number | string; freight?: string; notes?: string };
  lines: EditorLine[];
  questions: EditorQuestion[];
  criteria: { name: string; weight: number | string }[];
  supplierIds: string[];
  fxUsd: number | string;
  fxAsOf: string;
  ai_draft: boolean;
  assumptions: string[];
  open_questions: string[];
};

export const blankState = (): EditorState => ({
  title: "",
  description: "",
  category: "",
  currency: "INR",
  response_deadline: "",
  required_by: "",
  delivery_location: "",
  commercial_terms: { price_basis: "Delivered to site", tax: "GST extra, shown separately", payment_terms: "60 days from invoice", validity_days: 90, freight: "Include in rates or state separately" },
  lines: [{ description: "", specification: "", quantity: "", uom: "pcs", category: "" }],
  questions: [],
  criteria: [
    { name: "Evaluated cost", weight: 60 },
    { name: "Quality / qualification", weight: 25 },
    { name: "Lead time & terms", weight: 15 },
  ],
  supplierIds: [],
  fxUsd: 84.2,
  fxAsOf: "2026-10-20",
  ai_draft: false,
  assumptions: [],
  open_questions: [],
});

