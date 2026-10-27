"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import clsx from "clsx";
import { readJson } from "@/lib/read-json";

/**
 * A delete button with a confirmation dialog. Calls DELETE on `url`, then goes to `redirectTo`
 * (or refreshes the current page).
 */
export function ConfirmDelete({
  url,
  title,
  body,
  confirmLabel = "Delete",
  redirectTo,
  label,
  className,
}: {
  url: string;
  title: string;
  body: React.ReactNode;
  confirmLabel?: string;
  redirectTo?: string;
  /** Text next to the icon; icon-only when omitted. */
  label?: string;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && !busy && setOpen(false);
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, busy]);

  async function run() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(url, { method: "DELETE" });
      const j = await readJson(res);
      if (!res.ok) throw new Error(j.error ?? "Couldn't delete");
      setOpen(false);
      if (redirectTo) router.push(redirectTo);
      router.refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Couldn't delete");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={clsx("btn-ghost text-ink-muted hover:text-bad-strong", !label && "px-2", className)}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        title={title}
        aria-label={title}
      >
        <Trash2 className="w-4 h-4" />
        {label}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" role="alertdialog" aria-modal="true" aria-label={title} onClick={() => !busy && setOpen(false)}>
          <div className="card w-full max-w-md p-5 space-y-4 shadow-xl text-left" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-[16px]">{title}</h3>
            <div className="text-[13.5px] text-ink-muted space-y-2">{body}</div>
            {err && <div className="chip chip-bad !whitespace-normal !rounded-md">{err}</div>}
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" disabled={busy} onClick={() => setOpen(false)} autoFocus>
                Cancel
              </button>
              <button className="btn-primary" style={{ background: "rgb(var(--c-danger))", borderColor: "rgb(var(--c-danger))", color: "#fff" }} disabled={busy} onClick={run}>
                {busy && <Loader2 className="w-4 h-4 animate-spin" />} {confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
