"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { Check } from "lucide-react";

export type Step = { href: string; label: string; status: string; state: "done" | "current" | "todo"; warn?: boolean; exact?: boolean; match?: string[] };

export function FlowStepper({ steps }: { steps: Step[] }) {
  const path = usePathname();
  return (
    <nav aria-label="Sourcing steps" className="card flex overflow-x-auto">
      {steps.map((s, i) => {
        const active = s.exact ? path === s.href : (s.match ?? [s.href]).some((m) => path.startsWith(m));
        return (
          <Link
            key={s.href}
            href={s.href}
            aria-current={active ? "step" : undefined}
            className={clsx("relative flex-1 min-w-[150px] flex items-center gap-3 px-4 py-3 transition-colors", active ? "bg-primary/[0.06]" : "hover:bg-surface-muted/40", i > 0 && "border-l border-line")}
          >
            <span
              className={clsx(
                "w-7 h-7 shrink-0 rounded-full grid place-items-center text-[12px] font-bold",
                s.state === "done" ? "bg-ok text-white" : active ? "bg-primary text-primary-fg" : "bg-surface-muted text-ink-muted",
              )}
            >
              {s.state === "done" ? <Check className="w-4 h-4" /> : i + 1}
            </span>
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
