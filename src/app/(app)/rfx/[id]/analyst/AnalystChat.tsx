"use client";
import { Database, Trash2 } from "lucide-react";
import { AskBox, Conversation, useCopilot } from "@/components/CopilotChat";
import { Empty } from "@/components/ui";

const SUGGESTIONS = [
  "Which supplier has the lowest comparable cost for the lines quoted by all suppliers? Show the calculation and exclusions.",
  "Which suppliers quoted fewer than 30 lines, and which items are missing?",
  "What if we split it — cheapest per line, but only among vendors who cleared the quality questionnaire?",
  "Normalize the unit prices where pack-size information is available. Which rows still need human review?",
  "Compare the lowest-cost supplier with the best questionnaire response. What are the trade-offs?",
  "What changes if freight is included in evaluated cost? Show the assumptions and affected suppliers.",
  "List every value in the comparison that has low confidence or lacks source evidence.",
  "Create an exportable comparison table with raw quote, normalized unit price, currency, coverage, and source reference.",
];

export function AnalystChat({ rfqId, hasData }: { rfqId: string; initial?: any[]; hasData: boolean }) {
  const { msgs, busy, ask, clear } = useCopilot(rfqId);
  return (
    <div className="grid lg:grid-cols-[1fr_300px] gap-4">
      <div className="card flex flex-col h-[calc(100vh-260px)] min-h-[520px]">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-line">
          <div className="text-[12.5px] text-ink-muted flex items-center gap-1.5"><Database className="w-3.5 h-3.5" /> Every number is calculated from this event&apos;s quotes — open any step to see how.</div>
          {msgs.length > 0 && <button className="btn-ghost btn-sm" onClick={clear}><Trash2 className="w-3.5 h-3.5" /> Clear</button>}
        </div>
        <div className="flex-1 overflow-auto px-4 py-4">
          {msgs.length === 0 ? <Empty title="Ask anything about this event" body={hasData ? "Pick a question on the right, or type your own." : "Receive supplier replies first — I answer from their quotes."} /> : <Conversation msgs={msgs} />}
        </div>
        <div className="border-t border-line p-3"><AskBox onAsk={ask} busy={busy} placeholder="e.g. Cheapest per line, only among qualified vendors?" /></div>
      </div>
      <aside className="space-y-2">
        <div className="text-[13px] font-semibold text-ink-muted">Try asking</div>
        {SUGGESTIONS.map((s) => (
          <button key={s} className="card text-left text-[12.5px] px-3 py-2 w-full hover:border-accent disabled:opacity-50" disabled={busy || !hasData} onClick={() => ask(s)}>{s}</button>
        ))}
      </aside>
    </div>
  );
}
