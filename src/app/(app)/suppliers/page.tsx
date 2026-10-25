import { getContext } from "@/lib/context";
import { Card, Empty, PageHeader } from "@/components/ui";
import { AddSupplier } from "./AddSupplier";

export const dynamic = "force-dynamic";

export default async function Suppliers() {
  const ctx = await getContext();
  const [{ data: sups }, { data: inv }] = await Promise.all([
    ctx.supabase.from("suppliers").select("*").order("name"),
    ctx.supabase.from("rfq_suppliers").select("supplier_id, response_status"),
  ]);
  return (
    <div className="max-w-6xl">
      <PageHeader title="Suppliers" subtitle="Organization-scoped supplier records." actions={<AddSupplier />} />
      <Card pad={false}>
        {!sups?.length ? (
          <Empty title="No suppliers yet" body="Add suppliers or load the demo event from Sourcing events." />
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Supplier</th>
                <th>Contact</th>
                <th>Location</th>
                <th className="text-right">Events invited</th>
                <th className="text-right">Responded</th>
              </tr>
            </thead>
            <tbody>
              {sups.map((s) => {
                const mine = (inv ?? []).filter((i) => i.supplier_id === s.id);
                return (
                  <tr key={s.id}>
                    <td>
                      <div className="font-semibold">{s.name}</div>
                      {s.is_demo && <span className="chip chip-muted">fictional demo supplier</span>}
                    </td>
                    <td className="text-[12.5px]">
                      {s.contact_name}
                      <div className="text-ink-muted">{s.email}</div>
                    </td>
                    <td className="text-[12.5px]">{s.location}</td>
                    <td className="text-right num">{mine.length}</td>
                    <td className="text-right num">{mine.filter((m) => m.response_status === "responded").length}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
