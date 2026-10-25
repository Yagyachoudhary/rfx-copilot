"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, ZoomIn, ZoomOut } from "lucide-react";
import clsx from "clsx";

export type Target = { fileId: string | null; loc?: any; snippet?: string | null; label?: string | null } | null;

const cache = new Map<string, any>();

function colIndex(letters: string) {
  return letters.split("").reduce((a, c) => a * 26 + (c.charCodeAt(0) - 64), 0);
}
const colName = (i: number) => {
  let s = "";
  while (i > 0) {
    const m = (i - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    i = Math.floor((i - 1) / 26);
  }
  return s;
};
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9.]+/g, " ").trim();

function findBySnippet<T>(items: T[], text: (t: T) => string, snippet?: string | null): number {
  if (!snippet) return -1;
  const parts = norm(snippet).split(" ").filter((w) => w.length > 2);
  if (!parts.length) return -1;
  let best = -1;
  let bestScore = 0;
  items.forEach((it, i) => {
    const t = norm(text(it));
    const score = parts.filter((w) => t.includes(w)).length;
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  });
  return bestScore >= Math.min(2, parts.length) ? best : -1;
}

export function SourceViewer({ fileId, target }: { fileId: string; target: Target }) {
  const [data, setData] = useState<any>(cache.get(fileId) ?? null);
  const [err, setErr] = useState<string | null>(null);
  const [sheet, setSheet] = useState<string | null>(null);
  const [zoom, setZoom] = useState(false);
  const hlRef = useRef<HTMLElement | null>(null);
  const loc = target?.fileId === fileId ? target.loc ?? {} : {};
  const snippet = target?.fileId === fileId ? target.snippet : null;

  useEffect(() => {
    if (cache.has(fileId)) {
      setData(cache.get(fileId));
      return;
    }
    setData(null);
    setErr(null);
    fetch(`/api/files/${fileId}/preview`)
      .then((r) => r.json())
      .then((j) => {
        if (j.error) throw new Error(j.error);
        cache.set(fileId, j);
        setData(j);
      })
      .catch((e) => setErr(e.message));
  }, [fileId]);

  useEffect(() => {
    if (data?.kind === "sheet") setSheet(loc.sheet && data.sheets.some((s: any) => s.name === loc.sheet) ? loc.sheet : (sheet ?? data.sheets[0]?.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, loc.sheet]);

  useEffect(() => {
    const t = setTimeout(() => hlRef.current?.scrollIntoView({ block: "center", behavior: "smooth" }), 80);
    return () => clearTimeout(t);
  }, [target, data, sheet]);

  if (err) return <div className="p-6 text-bad-strong text-[13px]">Couldn&apos;t open this file: {err}</div>;
  if (!data) return <div className="p-10 grid place-items-center text-ink-muted"><Loader2 className="w-5 h-5 animate-spin" /></div>;

  const setHl = (on: boolean) => (el: HTMLElement | null) => {
    if (on) hlRef.current = el;
  };

  if (data.kind === "sheet") {
    const sh = data.sheets.find((s: any) => s.name === sheet) ?? data.sheets[0];
    const cellRef = loc.cell ? String(loc.cell).match(/^([A-Z]+)(\d+)$/) : null;
    const hlRow = cellRef ? Number(cellRef[2]) : loc.row ?? (sh ? sh.rows[findBySnippet(sh.rows, (r: any) => Object.values(r.cells).join(" "), snippet)]?.r : null);
    const hlCol = cellRef ? cellRef[1] : null;
    const cols = Array.from({ length: Math.max(sh?.maxCol ?? 1, 1) }, (_, i) => colName(i + 1));
    return (
      <div className="flex flex-col h-full">
        <div className="flex gap-1 px-2 pt-2 border-b border-line bg-surface-muted/30">
          {data.sheets.map((s: any) => (
            <button key={s.name} onClick={() => setSheet(s.name)} className={clsx("px-3 py-1.5 text-[12px] rounded-t-md border border-b-0", s.name === sh?.name ? "bg-surface border-line font-semibold" : "border-transparent text-ink-muted")}>
              {s.name}
            </button>
          ))}
        </div>
        <div className="overflow-auto flex-1">
          <table className="text-[12px] border-collapse min-w-full">
            <thead>
              <tr>
                <th className="sticky top-0 bg-surface-muted w-10 border border-line" />
                {cols.map((c) => (
                  <th key={c} className={clsx("sticky top-0 bg-surface-muted border border-line px-2 py-0.5 font-medium text-ink-muted", c === hlCol && "text-accent")}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sh?.rows.map((row: any) => {
                const on = row.r === hlRow;
                return (
                  <tr key={row.r} ref={setHl(on && !hlCol) as any} className={clsx(on && "bg-accent/10")}>
                    <td className={clsx("border border-line px-1.5 text-right text-ink-muted bg-surface-muted/40", on && "text-accent font-semibold")}>{row.r}</td>
                    {cols.map((c) => {
                      const v = row.cells[c] ?? "";
                      const hit = on && c === hlCol;
                      return (
                        <td key={c} ref={setHl(hit) as any} className={clsx("border border-line px-2 py-0.5 whitespace-nowrap max-w-[260px] truncate", hit && "hl font-semibold", /^[\d.,]+$/.test(v) && "text-right num")} title={v}>
                          {v}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (data.kind === "doc" || data.kind === "lines") {
    const items: { n: number; text: string; kind?: string; cells?: string[] }[] =
      data.kind === "doc" ? data.paragraphs : data.lines.map((t: string, i: number) => ({ n: i + 1, text: t }));
    let hl = loc.paragraph ? Number(loc.paragraph) : null;
    if (!hl) {
      const i = findBySnippet(items, (x) => x.text, snippet);
      hl = i >= 0 ? items[i].n : null;
    }
    return (
      <div className={clsx("overflow-auto h-full", data.kind === "lines" ? "p-4 font-mono text-[12.5px]" : "px-8 py-6 text-[13.5px] leading-relaxed")}>
        {items.map((p) => {
          const on = p.n === hl;
          if (data.kind === "lines")
            return (
              <div key={p.n} ref={setHl(on) as any} className={clsx("flex gap-3 px-1 rounded", on && "hl")}>
                <span className="w-6 text-right text-ink-muted select-none">{p.n}</span>
                <span className="whitespace-pre-wrap">{p.text || " "}</span>
              </div>
            );
          if (p.kind === "row")
            return (
              <div key={p.n} ref={setHl(on) as any} className={clsx("grid grid-cols-3 border-x border-b border-line first:border-t text-[12.5px]", on && "hl")}>
                {(p.cells ?? []).map((c, i) => <div key={i} className="px-2 py-1 border-r border-line last:border-r-0">{c}</div>)}
              </div>
            );
          return (
            <p key={p.n} ref={setHl(on) as any} className={clsx("my-2 rounded px-1 -mx-1", p.kind === "heading" && "font-bold text-[15px] mt-4", on && "hl")}>
              {p.text}
            </p>
          );
        })}
      </div>
    );
  }

  if (data.kind === "pdf")
    return <iframe key={`${loc.page ?? 1}`} title="Supplier PDF" src={`${data.url}#page=${loc.page ?? 1}&view=FitH`} className="w-full h-full border-0" />;

  return (
    <div className="relative h-full overflow-auto bg-[#2a2733]">
      <button className="absolute right-3 top-3 z-10 btn-secondary btn-sm" onClick={() => setZoom(!zoom)}>
        {zoom ? <ZoomOut className="w-3.5 h-3.5" /> : <ZoomIn className="w-3.5 h-3.5" />} {zoom ? "Fit" : "Zoom"}
      </button>
      <img src={data.url} alt="Supplier photo" className={clsx("mx-auto", zoom ? "max-w-none w-[180%]" : "max-h-full max-w-full object-contain")} />
    </div>
  );
}

export { colIndex };
