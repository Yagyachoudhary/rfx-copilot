"use client";
import { readJson } from "@/lib/read-json";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, X } from "lucide-react";

export function AddSupplier() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", contact_name: "", email: "", phone: "", location: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!open)
    return (
      <button className="btn-primary" onClick={() => setOpen(true)}>
        <Plus className="w-4 h-4" /> Add supplier
      </button>
    );
  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4">
      <form
        className="card w-full max-w-md p-5 space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setErr(null);
          const res = await fetch("/api/suppliers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(f) });
          const j = await readJson(res);
          setBusy(false);
          if (!res.ok) return setErr(j.error);
          setOpen(false);
          router.refresh();
        }}
      >
        <div className="flex justify-between items-center">
          <h3 className="font-bold">Add supplier</h3>
          <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(false)} aria-label="Close"><X className="w-4 h-4" /></button>
        </div>
        {(["name", "contact_name", "email", "phone", "location"] as const).map((k) => (
          <div key={k}>
            <label className="label capitalize">{k.replace("_", " ")}</label>
            <input className="input" required={k === "name"} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
          </div>
        ))}
        {err && <div className="chip chip-bad">{err}</div>}
        <button className="btn-primary w-full" disabled={busy}>{busy && <Loader2 className="w-4 h-4 animate-spin" />} Save</button>
      </form>
    </div>
  );
}
