"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Database, Loader2 } from "lucide-react";

export function SeedDemoButton({ primary }: { primary?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-end">
    <button
      className={primary ? "btn-primary" : "btn-secondary"}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const res = await fetch("/api/demo/seed", { method: "POST" });
        const j = await res.json();
        setBusy(false);
        if (!res.ok) return setErr(j.error ?? "Failed");
        router.push(`/rfx/${j.rfqId}/responses`);
        router.refresh();
      }}
    >
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />} Load demo event
    </button>
    {err && <span className="text-[11px] text-bad-strong mt-1 max-w-xs">{err}</span>}
    </span>
  );
}
