"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { Check, FilePen, Gavel, Inbox, Scale, Send } from "lucide-react";

const ICONS = [FilePen, Send, Inbox, Scale, Gavel];
const COLORS = ["--c-brand-mid", "--c-accent", "--c-warning", "--c-success", "--c-brand-end"];

export type Step = { href: string; label: string; status: string; state: "done" | "current" | "todo"; warn?: boolean; exact?: boolean; match?: string[] };

export function FlowStepper({ steps }: { steps: Step[] }) {
  const path = usePathname();
  return (
    <nav aria-label="Sourcing steps" className="card flex overflow-x-auto shadow-sm">
      {steps.map((s, i) => {
        const active = s.exact ? path === s.href : (s.match ?? [s.href]).some((m) => path.startsWith(m));
        return (
          <Link
            key={s.href}
            href={s.href}
            aria-current={active ? "step" : undefined}
            className={clsx("relative flex-1 min-w-[150px] flex items-center gap-3 px-4 py-3 transition-colors", active ? "bg-primary/[0.06]" : "hover:bg-surface-muted/40", i > 0 && "border-l border-line")}
          >
            {(() => {
              const Icon = ICONS[i] ?? Check;
              const c = `rgb(var(${COLORS[i]}))`;
              return (
                <span
                  className="relative w-9 h-9 shrink-0 rounded-xl grid place-items-center"
                  style={active ? { background: c, color: "#fff" } : { color: s.state === "todo" ? "rgb(var(--c-muted))" : c, border: `1.5px solid ${s.state === "todo" ? "rgb(var(--c-border))" : c}` }}
                >
                  <Icon className="w-[18px] h-[18px]" />
                  {s.state === "done" && <span className="absolute -right-1.5 -bottom-1.5 w-4 h-4 rounded-full bg-ok text-white grid place-items-center ring-2 ring-surface"><Check className="w-2.5 h-2.5" /></span>}
                </span>
              );
            })()}
            <span className="min-w-0">
              <span className={clsx("block text-[13.5px] font-semibold", !active && s.state === "todo" && "text-ink-muted")}>{s.label}</span>
              <span className={clsx("block text-[12px] truncate", s.warn ? "text-warn-strong font-semibold" : "text-ink-muted")}>{s.status}</span>
            </span>
            {active && <span className="absolute left-0 right-0 bottom-0 h-[3px] bg-primary" />}
          </Link>
        );
      })}
    </nav>
  );
}
