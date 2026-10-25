import { FileStack, Scale, Wand2 } from "lucide-react";

export const PROBLEM =
  "You send an RFQ to five suppliers. Back comes an Excel that ignores your template, a PDF with the discount in a footnote, a quote in dollars, a phone photo of a rate card and a one-line email. Comparing them means days of retyping — and still guessing.";

const STEPS = [
  { icon: Wand2, title: "Draft", body: "Describe what you need. Copilot writes the RFx — lines, questionnaire, terms." },
  { icon: FileStack, title: "Collect anything", body: "Suppliers reply in any format. Every price is read and linked to where it came from." },
  { icon: Scale, title: "Compare & decide", body: "Same lines, units and currency. Gaps stay visible. Ask questions; you make the call." },
];

export function HowItWorks({ tone = "light" }: { tone?: "light" | "dark" }) {
  const muted = tone === "dark" ? "text-white/80" : "text-ink-muted";
  return (
    <ol className="space-y-4">
      {STEPS.map((s, i) => (
        <li key={s.title} className="flex gap-3">
          <span className={tone === "dark" ? "w-9 h-9 shrink-0 rounded-lg bg-white/15 grid place-items-center" : "w-9 h-9 shrink-0 rounded-lg bg-primary/10 text-primary grid place-items-center"}>
            <s.icon className="w-4 h-4" />
          </span>
          <div>
            <div className="font-semibold">{i + 1}. {s.title}</div>
            <div className={`text-[13.5px] ${muted}`}>{s.body}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}
