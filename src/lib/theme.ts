// Design tokens. Stored per organization in `organization_theme.tokens`, applied as CSS variables.

export type ThemeTokens = {
  brandStart: string;
  brandMid: string;
  brandEnd: string;
  primary: string; // primary buttons / selected nav
  accent: string; // links, focus rings, interactive outlines
  bg: string; // page canvas
  surface: string; // cards, tables, dialogs
  surfaceMuted: string; // soft tinted surfaces
  frame: string; // sparing decorative frame
  text: string;
  muted: string;
  border: string;
  success: string;
  warning: string;
  danger: string;
  radius: number; // px
  density: "compact" | "comfortable";
  font: "inter" | "jakarta" | "plex" | "system";
  nav: "brand" | "light" | "dark";
};

export const DEFAULT_THEME: ThemeTokens = {
  brandStart: "#3E0FBD",
  brandMid: "#6D29D6",
  brandEnd: "#9032F6",
  primary: "#5B1FD1",
  accent: "#2F80FF",
  bg: "#F5F7FB",
  surface: "#FFFFFF",
  surfaceMuted: "#E7E4F3",
  frame: "#9E99C9",
  text: "#17152B",
  muted: "#5E6170",
  border: "#E5E7EF",
  success: "#2EAD55",
  warning: "#F59E0B",
  danger: "#E9473D",
  radius: 10,
  density: "compact",
  font: "jakarta",
  nav: "brand",
};

export const NEUTRAL_THEME: ThemeTokens = {
  brandStart: "#1F2937",
  brandMid: "#374151",
  brandEnd: "#4B5563",
  primary: "#111827",
  accent: "#2563EB",
  bg: "#F8FAFC",
  surface: "#FFFFFF",
  surfaceMuted: "#EEF2F7",
  frame: "#CBD5E1",
  text: "#0F172A",
  muted: "#475569",
  border: "#E2E8F0",
  success: "#16A34A",
  warning: "#D97706",
  danger: "#DC2626",
  radius: 8,
  density: "comfortable",
  font: "inter",
  nav: "light",
};

export const COLOR_KEYS: { key: keyof ThemeTokens; label: string; hint: string }[] = [
  { key: "brandStart", label: "Brand (gradient start)", hint: "Navigation and feature panels" },
  { key: "brandMid", label: "Brand (gradient mid)", hint: "Gradient mid-tone" },
  { key: "brandEnd", label: "Brand (gradient end)", hint: "Gradient end / bright accent" },
  { key: "primary", label: "Primary action", hint: "Primary buttons, selected items" },
  { key: "accent", label: "Interactive accent", hint: "Links, focus rings, outlines" },
  { key: "bg", label: "Page background", hint: "App canvas" },
  { key: "surface", label: "Surface", hint: "Cards, tables, dialogs" },
  { key: "surfaceMuted", label: "Muted surface", hint: "Tinted panels and chips" },
  { key: "frame", label: "Frame", hint: "Sparing decorative frame" },
  { key: "text", label: "Text", hint: "Headings and body" },
  { key: "muted", label: "Muted text", hint: "Labels and helper text" },
  { key: "border", label: "Border", hint: "Dividers and card edges" },
  { key: "success", label: "Success", hint: "Complete / verified (always with a label)" },
  { key: "warning", label: "Warning", hint: "Needs review / incomplete" },
  { key: "danger", label: "Error", hint: "Failed / critical" },
];

export const FONT_STACKS: Record<ThemeTokens["font"], string> = {
  inter: "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
  jakarta: "'Plus Jakarta Sans', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
  plex: "'IBM Plex Sans', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
  system: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
};

const HEX = /^#([0-9a-f]{6})$/i;

export function normalizeHex(v: unknown, fallback: string): string {
  if (typeof v !== "string") return fallback;
  let s = v.trim();
  if (/^#[0-9a-f]{3}$/i.test(s)) s = "#" + s.slice(1).split("").map((c) => c + c).join("");
  return HEX.test(s) ? s.toUpperCase() : fallback;
}

export function sanitizeTokens(input: Partial<ThemeTokens> | null | undefined, base: ThemeTokens = DEFAULT_THEME): ThemeTokens {
  const t = { ...base } as ThemeTokens;
  if (!input) return t;
  for (const { key } of COLOR_KEYS) {
    (t as any)[key] = normalizeHex((input as any)[key], (base as any)[key]);
  }
  const r = Number(input.radius);
  t.radius = Number.isFinite(r) ? Math.max(0, Math.min(20, Math.round(r))) : base.radius;
  t.density = input.density === "comfortable" ? "comfortable" : input.density === "compact" ? "compact" : base.density;
  t.font = (["inter", "jakarta", "plex", "system"] as const).includes(input.font as any) ? (input.font as ThemeTokens["font"]) : base.font;
  t.nav = (["brand", "light", "dark"] as const).includes(input.nav as any) ? (input.nav as ThemeTokens["nav"]) : base.nav;
  return t;
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

const ch = (hex: string) => hexToRgb(hex).join(" ");

function luminance(hex: string) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string) {
  const l1 = luminance(a);
  const l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/** Best readable foreground for a background. */
export function onColor(bg: string) {
  return contrastRatio(bg, "#FFFFFF") >= contrastRatio(bg, "#111111") ? "#FFFFFF" : "#111111";
}

export type ContrastCheck = { label: string; fg: string; bg: string; ratio: number; required: number; ok: boolean };

export function contrastChecks(t: ThemeTokens): ContrastCheck[] {
  const checks: [string, string, string, number][] = [
    ["Body text on surface", t.text, t.surface, 4.5],
    ["Body text on background", t.text, t.bg, 4.5],
    ["Muted text on surface", t.muted, t.surface, 4.5],
    ["Button label on primary", onColor(t.primary), t.primary, 4.5],
    ["Link / accent on surface", t.accent, t.surface, 3],
    ["Navigation text on brand", onColor(t.brandStart), t.brandStart, 4.5],
    ["Error colour on surface", t.danger, t.surface, 3],
    ["Success colour on surface", t.success, t.surface, 3],
  ];
  return checks.map(([label, fg, bg, required]) => {
    const ratio = contrastRatio(fg, bg);
    return { label, fg, bg, ratio: Math.round(ratio * 100) / 100, required, ok: ratio >= required };
  });
}

/** CSS variables (space-separated RGB channels so Tailwind alpha modifiers work). */
export function tokensToCssVars(t: ThemeTokens): Record<string, string> {
  const navBg = t.nav === "brand" ? t.brandStart : t.nav === "dark" ? "#16131F" : t.surface;
  const navFg = onColor(navBg);
  return {
    "--c-brand-start": ch(t.brandStart),
    "--c-brand-mid": ch(t.brandMid),
    "--c-brand-end": ch(t.brandEnd),
    "--c-primary": ch(t.primary),
    "--c-on-primary": ch(onColor(t.primary)),
    "--c-accent": ch(t.accent),
    "--c-bg": ch(t.bg),
    "--c-surface": ch(t.surface),
    "--c-surface-muted": ch(t.surfaceMuted),
    "--c-frame": ch(t.frame),
    "--c-text": ch(t.text),
    "--c-muted": ch(t.muted),
    "--c-border": ch(t.border),
    "--c-success": ch(t.success),
    "--c-warning": ch(t.warning),
    "--c-danger": ch(t.danger),
    "--c-nav-bg": ch(navBg),
    "--c-nav-fg": ch(navFg),
    "--radius": `${t.radius}px`,
    "--density-row": t.density === "compact" ? "2rem" : "2.6rem",
    "--density-pad": t.density === "compact" ? "0.5rem" : "0.75rem",
    "--font-sans": FONT_STACKS[t.font],
    "--nav-gradient": t.nav === "brand" ? `linear-gradient(180deg, ${t.brandStart} 0%, ${t.brandMid} 100%)` : navBg,
  };
}

export function cssVarsToString(vars: Record<string, string>) {
  return Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(";");
}

/** Light/dark preference: dark mode derives neutral surfaces while keeping brand + status colours. */
export function applyMode(t: ThemeTokens, mode: "light" | "dark"): ThemeTokens {
  if (mode !== "dark") return t;
  return { ...t, bg: "#121019", surface: "#1B1826", surfaceMuted: "#2A2638", text: "#ECEAF5", muted: "#A9A6B8", border: "#2E2A3D", nav: t.nav === "light" ? "dark" : t.nav };
}
