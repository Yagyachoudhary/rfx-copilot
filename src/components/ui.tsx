import clsx from "clsx";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, CircleDashed, Info, Loader2, XCircle } from "lucide-react";
import type { ReactNode } from "react";

export const cx = clsx;

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
      <div className="min-w-0">
        {eyebrow && <div className="text-[12.5px] text-ink-muted mb-0.5">{eyebrow}</div>}
        <h1 className="text-[22px] font-bold text-ink leading-tight">{title}</h1>
        {subtitle && <p className="text-ink-muted mt-1 max-w-3xl">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}

export function Card({ children, className, title, actions, pad = true }: { children: ReactNode; className?: string; title?: ReactNode; actions?: ReactNode; pad?: boolean }) {
  return (
    <section className={cx("card", className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-line">
          <h2 className="font-semibold text-[14px]">{title}</h2>
          {actions}
        </header>
      )}
      <div className={pad ? "p-4" : ""}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "ok" | "warn" | "bad" }) {
  return (
    <div className="card px-4 py-3">
      <div className="text-[12.5px] text-ink-muted">{label}</div>
      <div className={cx("text-[22px] font-bold num mt-0.5", tone === "ok" && "text-ok-strong", tone === "warn" && "text-warn-strong", tone === "bad" && "text-bad-strong")}>{value}</div>
      {hint && <div className="text-[12px] text-ink-muted mt-0.5">{hint}</div>}
    </div>
  );
}

export function Empty({ title, body, action, icon }: { title: string; body?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-6">
      <div className="mb-3 text-ink-muted">{icon ?? <CircleDashed className="w-8 h-8" />}</div>
      <div className="font-semibold">{title}</div>
      {body && <div className="text-ink-muted mt-1 max-w-md">{body}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Severity({ s }: { s: "critical" | "warning" | "info" }) {
  if (s === "critical")
    return (
      <span className="chip chip-bad">
        <XCircle className="w-3 h-3" /> Critical
      </span>
    );
  if (s === "warning")
    return (
      <span className="chip chip-warn">
        <AlertTriangle className="w-3 h-3" /> Warning
      </span>
    );
  return (
    <span className="chip chip-info">
      <Info className="w-3 h-3" /> Info
    </span>
  );
}

const RESPONSE_STATUS: Record<string, { label: string; cls: string; spin?: boolean }> = {
  received: { label: "Received", cls: "chip-muted" },
  parsing: { label: "Parsing", cls: "chip-info", spin: true },
  extracting: { label: "Extracting", cls: "chip-info", spin: true },
  normalizing: { label: "Normalizing", cls: "chip-info", spin: true },
  needs_review: { label: "Needs review", cls: "chip-warn" },
  ready: { label: "Ready to compare", cls: "chip-ok" },
  failed: { label: "Failed", cls: "chip-bad" },
};

export function ResponseStatusChip({ status }: { status: string }) {
  const s = RESPONSE_STATUS[status] ?? { label: status, cls: "chip-muted" };
  return (
    <span className={cx("chip", s.cls)}>
      {s.spin ? <Loader2 className="w-3 h-3 animate-spin" /> : status === "ready" ? <CheckCircle2 className="w-3 h-3" /> : status === "failed" ? <XCircle className="w-3 h-3" /> : status === "needs_review" ? <AlertTriangle className="w-3 h-3" /> : null}
      {s.label}
    </span>
  );
}

const RFQ_STATUS: Record<string, string> = {
  draft: "chip-muted",
  sent: "chip-info",
  collecting: "chip-info",
  evaluating: "chip-brand",
  decided: "chip-ok",
  cancelled: "chip-bad",
};
export function RfqStatusChip({ status }: { status: string }) {
  return <span className={cx("chip capitalize", RFQ_STATUS[status] ?? "chip-muted")}>{status}</span>;
}

export function QualificationChip({ status, label }: { status: string; label: string }) {
  const cls = status === "qualified_verified" ? "chip-ok" : status === "qualified_claimed" ? "chip-info" : status === "not_qualified" ? "chip-bad" : "chip-warn";
  return <span className={cx("chip", cls)} title={label}>{status === "qualified_verified" ? "Qualified · verified" : status === "qualified_claimed" ? "Qualified · claims" : status === "not_qualified" ? "Not qualified" : "Incomplete"}</span>;
}

export function AiBadge({ label = "AI draft" }: { label?: string }) {
  return (
    <span className="chip text-white border-transparent ai-mark">
      <svg viewBox="0 0 16 16" className="w-3 h-3" fill="currentColor"><path d="M8 1l1.6 4.4L14 7l-4.4 1.6L8 13l-1.6-4.4L2 7l4.4-1.6z" /></svg>
      {label}
    </span>
  );
}

export function DemoBanner() {
  return (
    <div className="text-[12px] px-3 py-1.5 bg-surface-muted/70 border-b border-line text-ink-muted">
      <strong className="text-ink">Prototype.</strong> Buyer, suppliers, documents and prices are fictional demo data. Email delivery is simulated; extraction and analysis run live on the uploaded files.
    </div>
  );
}

export function LinkBtn({ href, children, variant = "secondary", className }: { href: string; children: ReactNode; variant?: "primary" | "secondary" | "ghost"; className?: string }) {
  return (
    <Link href={href} className={cx(variant === "primary" ? "btn-primary" : variant === "ghost" ? "btn-ghost" : "btn-secondary", className)}>
      {children}
    </Link>
  );
}

export function fmtDateTime(s: string | null | undefined) {
  if (!s) return "—";
  const d = new Date(s);
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" });
}
export function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}
