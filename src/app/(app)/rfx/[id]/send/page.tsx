import { getContext } from "@/lib/context";
import { fmtDate } from "@/components/ui";
import { SendForm } from "./SendForm";

export const dynamic = "force-dynamic";

export default async function SendPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getContext();
  const db = ctx.supabase;
  const [{ data: rfq }, { data: inv }, { count: lines }, { count: qs }] = await Promise.all([
    db.from("rfqs").select("*").eq("id", id).single(),
    db.from("rfq_suppliers").select("*, supplier:suppliers(id, name, email, contact_name)").eq("rfq_id", id),
    db.from("rfq_line_items").select("id", { count: "exact", head: true }).eq("rfq_id", id),
    db.from("rfq_questions").select("id", { count: "exact", head: true }).eq("rfq_id", id),
  ]);
  if (!rfq) return null;
  const subject = `${rfq.ref_code}: Request for quotation — ${rfq.title}`;
  const body = `Dear {contact_name},

${ctx.orgName} invites {supplier_name} to quote for: ${rfq.title}.

Scope: ${rfq.description ?? ""}
Line items: ${lines} (see attached schedule). Questionnaire: ${qs} questions.
Price basis: ${rfq.commercial_terms?.price_basis ?? "—"}. Tax: ${rfq.commercial_terms?.tax ?? "—"}. Payment: ${rfq.commercial_terms?.payment_terms ?? "—"}.
Please respond by ${fmtDate(rfq.response_deadline)}. You may reply in your own format — Excel, PDF, Word or email are all fine.

Regards,
${ctx.user.email}`;
  return (
    <SendForm
      rfqId={id}
      status={rfq.status}
      defaultSubject={subject}
      defaultBody={body}
      lines={lines ?? 0}
      questions={qs ?? 0}
      invites={(inv ?? []).map((i: any) => ({
        id: i.id,
        supplierId: i.supplier_id,
        name: i.supplier.name,
        email: i.supplier.email,
        contact: i.supplier.contact_name,
        delivery_status: i.delivery_status,
        response_status: i.response_status,
        invited_at: i.invited_at,
        channel: i.channel,
      }))}
    />
  );
}
