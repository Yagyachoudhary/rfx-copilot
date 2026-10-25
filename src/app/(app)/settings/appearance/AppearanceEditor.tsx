"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, CheckCircle2, ImageUp, LayoutGrid, Loader2, RotateCcw, Sparkles, Truck, Upload, Wand2, XCircle } from "lucide-react";
import { DEFAULT_THEME, applyMode, COLOR_KEYS, contrastChecks, NEUTRAL_THEME, sanitizeTokens, tokensToCssVars, type ThemeTokens } from "@/lib/theme";
import { AiBadge, cx, fmtDateTime } from "@/components/ui";

export function AppearanceEditor({ isAdmin, current, currentMode, currentVersion, logoUrl, versions, orgName }: { isAdmin: boolean; current: ThemeTokens; currentMode: "light" | "dark"; currentVersion: number | null; logoUrl: string | null; versions: any[]; orgName: string }) {
  const router = useRouter();
  const [t, setT] = useState<ThemeTokens>(current);
  const [mode, setMode] = useState<"light" | "dark">(currentMode);
  const [shot, setShot] = useState<File | null>(null);
  const [shotUrl, setShotUrl] = useState<string | null>(null);
  const [proposal, setProposal] = useState<any | null>(null);
  const [sourcePath, setSourcePath] = useState<string | null>(null);
  const [logo, setLogo] = useState<{ path: string; url: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const checks = useMemo(() => contrastChecks(applyMode(t, mode)), [t, mode]);
  const failing = checks.filter((c) => !c.ok);
  const previewVars = tokensToCssVars(applyMode(t, mode)) as React.CSSProperties;
  const dirty = JSON.stringify(t) !== JSON.stringify(current) || mode !== currentMode || !!logo;

  async function propose() {
    if (!shot) return;
    setBusy("propose");
    setErr(null);
    const fd = new FormData();
    fd.set("file", shot);
    const res = await fetch("/api/theme/propose", { method: "POST", body: fd });
    const j = await res.json();
    setBusy(null);
    if (!res.ok) return setErr(j.error);
    setProposal(j);
    setSourcePath(j.sourcePath);
    setT(sanitizeTokens(j.tokens, DEFAULT_THEME));
  }

  async function apply(tokens: ThemeTokens, label: string, extra: any = {}) {
    setBusy(label);
    setErr(null);
    setOk(null);
    const res = await fetch("/api/theme/apply", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tokens, mode, label, logoPath: logo?.path, sourceImagePath: sourcePath, rationale: proposal?.rationale ?? null, ...extra }),
    });
    const j = await res.json();
    setBusy(null);
    if (!res.ok) return setErr(j.error);
    setOk(`Applied as version ${j.version}`);
    setProposal(null);
    router.refresh();
  }

  return (
    <div className="grid xl:grid-cols-[430px_1fr] gap-5">
      <div className="space-y-4">
        {!isAdmin && <div className="chip chip-warn !whitespace-normal">Only workspace admins can change the theme. You can preview.</div>}
        <section className="card p-4 space-y-3">
          <h2 className="font-semibold flex items-center gap-1.5"><ImageUp className="w-4 h-4" /> Generate theme from screenshot</h2>
          <p className="text-[12.5px] text-ink-muted">Upload a screenshot of your procurement portal, ERP, intranet or a brand page (PNG/JPG). The screenshot is analysed for colours and style only — it is never used as a background.</p>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="text-[13px]"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setShot(f);
              setShotUrl(f ? URL.createObjectURL(f) : null);
            }}
          />
          {shotUrl && <img src={shotUrl} alt="Uploaded brand screenshot" className="rounded border border-line max-h-48 object-contain w-full bg-surface-muted/30" />}
          <button className="btn-primary" disabled={!shot || !!busy || !isAdmin} onClick={propose}>
            {busy === "propose" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />} {busy === "propose" ? "Analysing screenshot…" : "Generate theme from screenshot"}
          </button>
          {proposal && (
            <div className="rounded-md border border-line p-3 space-y-2 text-[12.5px]">
              <AiBadge label="AI-proposed — review before applying" />
              <p>{proposal.rationale}</p>
              {proposal.palette?.length > 0 && (
                <div>
                  <div className="text-ink-muted mb-1">Sampled from the image:</div>
                  <div className="flex flex-wrap gap-1">
                    {proposal.palette.map((p: any) => (
                      <span key={p.hex} className="inline-flex items-center gap-1 text-[11px] num border border-line rounded px-1">
                        <span className="w-3 h-3 rounded-sm border border-line" style={{ background: p.hex }} /> {p.hex} · {p.share}%
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {(proposal.warnings ?? []).map((w: string, i: number) => (
                <div key={i} className="text-warn-strong flex gap-1"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {w}</div>
              ))}
              <div className="text-ink-muted">Screenshot matching is approximate. Adjust any colour below, or reject the proposal.</div>
              <button className="btn-ghost btn-sm" onClick={() => { setProposal(null); setT(current); }}><XCircle className="w-3.5 h-3.5" /> Reject proposal</button>
            </div>
          )}
        </section>

        <section className="card p-4 space-y-3">
          <h2 className="font-semibold">Design tokens</h2>
          <div className="grid grid-cols-1 gap-2">
            {COLOR_KEYS.map(({ key, label, hint }) => {
              const note = proposal?.per_token_notes?.find((n: any) => n.token === key)?.note;
              return (
                <div key={key} className="flex items-center gap-2">
                  <input type="color" aria-label={label} value={(t as any)[key]} onChange={(e) => setT({ ...t, [key]: e.target.value.toUpperCase() })} className="w-8 h-8 rounded border border-line bg-transparent p-0.5 shrink-0" disabled={!isAdmin} />
                  <input className="input w-24 num uppercase" value={(t as any)[key]} onChange={(e) => setT(sanitizeTokens({ ...t, [key]: e.target.value }, t))} disabled={!isAdmin} />
                  <div className="min-w-0">
                    <div className="text-[12.5px] font-semibold leading-tight">{label}</div>
                    <div className="text-[11px] text-ink-muted leading-tight truncate" title={note ?? hint}>{note ?? hint}</div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-2 pt-2">
            <div>
              <label className="label">Corner radius ({t.radius}px)</label>
              <input type="range" min={0} max={20} value={t.radius} onChange={(e) => setT({ ...t, radius: Number(e.target.value) })} className="w-full" disabled={!isAdmin} />
            </div>
            <div>
              <label className="label">Density</label>
              <select className="input" value={t.density} onChange={(e) => setT({ ...t, density: e.target.value as any })} disabled={!isAdmin}>
                <option value="compact">Compact</option>
                <option value="comfortable">Comfortable</option>
              </select>
            </div>
            <div>
              <label className="label">Typography</label>
              <select className="input" value={t.font} onChange={(e) => setT({ ...t, font: e.target.value as any })} disabled={!isAdmin}>
                <option value="jakarta">Plus Jakarta Sans</option>
                <option value="inter">Inter</option>
                <option value="plex">IBM Plex Sans</option>
                <option value="system">System UI</option>
              </select>
            </div>
            <div>
              <label className="label">Navigation</label>
              <select className="input" value={t.nav} onChange={(e) => setT({ ...t, nav: e.target.value as any })} disabled={!isAdmin}>
                <option value="brand">Brand gradient</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </div>
            <div>
              <label className="label">Mode</label>
              <select className="input" value={mode} onChange={(e) => setMode(e.target.value as any)} disabled={!isAdmin}>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </div>
            <div>
              <label className="label">Logo</label>
              <label className={cx("btn-secondary w-full", !isAdmin && "opacity-50 pointer-events-none")}>
                <Upload className="w-3.5 h-3.5" /> {logo ? "Replace" : "Upload"}
                <input
                  type="file"
                  accept="image/png,image/svg+xml,image/jpeg"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const fd = new FormData();
                    fd.set("file", f);
                    setBusy("logo");
                    const res = await fetch("/api/theme/logo", { method: "POST", body: fd });
                    const j = await res.json();
                    setBusy(null);
                    if (!res.ok) return setErr(j.error);
                    setLogo(j);
                  }}
                />
              </label>
            </div>
          </div>
        </section>

        <section className="card p-4">
          <h2 className="font-semibold mb-2">Accessibility checks (WCAG contrast)</h2>
          <ul className="space-y-1 text-[12.5px]">
            {checks.map((c) => (
              <li key={c.label} className="flex items-center gap-2">
                {c.ok ? <CheckCircle2 className="w-3.5 h-3.5 text-ok-strong" /> : <AlertTriangle className="w-3.5 h-3.5 text-warn-strong" />}
                <span className="flex-1">{c.label}</span>
                <span className={cx("num font-semibold", !c.ok && "text-warn-strong")}>{c.ratio}:1</span>
                <span className="text-ink-muted num">min {c.required}</span>
              </li>
            ))}
          </ul>
          {failing.length > 0 && <p className="text-[12px] text-warn-strong mt-2">{failing.length} check(s) below the recommended ratio — readability will suffer. Status colours always carry a text label, so meaning is not lost.</p>}
        </section>

        {err && <div className="chip chip-bad !whitespace-normal">{err}</div>}
        {ok && <div className="chip chip-ok">{ok}</div>}
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" disabled={!isAdmin || !!busy || !dirty} onClick={() => apply(t, proposal ? "AI-assisted theme" : "Manual edit")}>
            {busy && busy !== "propose" && busy !== "logo" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Apply to workspace
          </button>
          <button className="btn-secondary" disabled={!isAdmin || !!busy} onClick={() => { setT(DEFAULT_THEME); setMode("light"); apply(DEFAULT_THEME, "Reset to default", { mode: "light" }); }}>
            <RotateCcw className="w-3.5 h-3.5" /> Reset to default
          </button>
          <button className="btn-ghost" disabled={!isAdmin || !!busy} onClick={() => { setT(NEUTRAL_THEME); setMode("light"); apply(NEUTRAL_THEME, "Reset to neutral", { mode: "light" }); }}>
            Neutral theme
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <div className="text-[12px] text-ink-muted flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5" /> Live preview using real app components {dirty ? <span className="chip chip-warn">unsaved</span> : <span className="chip chip-muted">{currentVersion ? `matches workspace v${currentVersion}` : "built-in default"}</span>}
        </div>
        <div style={previewVars} className="font-sans rounded-xl overflow-hidden border border-line shadow-sm">
          <div className="flex min-h-[560px] bg-canvas text-ink">
            <aside className="w-48 text-nav-fg p-3 space-y-1 text-[13px]" style={{ background: "var(--nav-gradient)" }}>
              <div className="font-bold mb-3 flex items-center gap-2">
                {logo?.url || logoUrl ? <img src={logo?.url ?? logoUrl!} alt="logo" className="h-6 max-w-[140px] object-contain" /> : orgName}
              </div>
              <div className="px-2 py-1.5 rounded bg-white/15 font-semibold flex items-center gap-2"><LayoutGrid className="w-3.5 h-3.5" /> Sourcing</div>
              <div className="px-2 py-1.5 rounded opacity-80 flex items-center gap-2"><Truck className="w-3.5 h-3.5" /> Suppliers</div>
            </aside>
            <div className="flex-1 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-ink-muted font-semibold">RFQ-2026-0142</div>
                  <div className="text-[18px] font-bold">Corrugated packaging — rate contract</div>
                </div>
                <div className="flex gap-2">
                  <button className="btn-secondary">Export</button>
                  <button className="btn-primary">Create RFx</button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[["Responses", "5/5"], ["Critical", "3"], ["Lowest basket", "₹48.2 L"]].map(([a, b]) => (
                  <div key={a} className="card px-3 py-2">
                    <div className="text-[11px] uppercase text-ink-muted font-semibold">{a}</div>
                    <div className="text-[18px] font-bold num">{b}</div>
                  </div>
                ))}
              </div>
              <div className="card overflow-hidden">
                <table className="tbl">
                  <thead><tr><th>Line</th><th>Deccan</th><th>Shree Balaji</th><th>Pacific (USD)</th></tr></thead>
                  <tbody>
                    <tr><td>L1 3-ply 250×200×150</td><td className="num font-semibold text-ok-strong">₹9.02</td><td className="num">₹9.48</td><td className="num">₹8.56 <span className="chip chip-info">FX</span></td></tr>
                    <tr><td>L22 Sheet roll 1m×50m</td><td className="hatch text-[11px] font-semibold text-ink-muted">NOT QUOTED</td><td className="num">₹659</td><td className="num">₹595</td></tr>
                    <tr><td>L26 BOPP 72mm printed</td><td className="num">₹56.9</td><td className="num">₹59.7</td><td className="bg-warn/10 text-[11px]"><span className="text-warn-strong font-semibold">REVIEW</span> per box, pack size?</td></tr>
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="chip chip-ok">Ready to compare</span>
                <span className="chip chip-warn">Needs review</span>
                <span className="chip chip-bad">Critical</span>
                <span className="chip chip-info">Converted USD→INR</span>
                <span className="chip chip-brand">Qualified · claims</span>
              </div>
              <div className="card p-3 grid grid-cols-2 gap-2 max-w-md">
                <div><label className="label">Response deadline</label><input className="input" defaultValue="2026-11-06" /></div>
                <div><label className="label">Currency</label><select className="input"><option>INR</option></select></div>
                <a className="text-accent text-[13px] font-semibold col-span-2" href="#preview">Link / accent colour</a>
              </div>
              <div className="brand-gradient text-white rounded-tok p-4 max-w-md">
                <div className="font-bold">Feature panel</div>
                <div className="text-white/85 text-[13px]">Brand gradient, used sparingly.</div>
              </div>
            </div>
          </div>
        </div>
        <section className="card p-4">
          <h2 className="font-semibold mb-2">Version history</h2>
          {versions.length === 0 ? (
            <p className="text-[13px] text-ink-muted">Using the built-in default theme. Applying a theme creates version 1.</p>
          ) : (
            <ul className="divide-y divide-line">
              {versions.map((v) => (
                <li key={v.id} className="py-2 flex items-center gap-3 text-[13px]">
                  <span className="num font-semibold w-10">v{v.version}</span>
                  <span className="flex gap-0.5">{["brandStart", "primary", "accent", "bg", "text"].map((k) => <span key={k} className="w-4 h-4 rounded-sm border border-line" style={{ background: v.tokens?.[k] }} />)}</span>
                  <span className="flex-1">{v.label ?? "—"}{v.mode === "dark" ? " · dark" : ""}</span>
                  <span className={cx("chip", v.status === "applied" ? "chip-ok" : "chip-muted")}>{v.status}</span>
                  <span className="text-ink-muted text-[12px] num">{fmtDateTime(v.applied_at ?? v.created_at)}</span>
                  {v.status !== "applied" && isAdmin && (
                    <button className="btn-ghost btn-sm" onClick={() => { setT(sanitizeTokens(v.tokens)); setMode(v.mode); }}>Load</button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
