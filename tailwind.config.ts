import type { Config } from "tailwindcss";

const v = (name: string) => `rgb(var(${name}) / <alpha-value>)`;

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: { start: v("--c-brand-start"), mid: v("--c-brand-mid"), end: v("--c-brand-end") },
        primary: { DEFAULT: v("--c-primary"), fg: v("--c-on-primary") },
        accent: v("--c-accent"),
        canvas: v("--c-bg"),
        surface: { DEFAULT: v("--c-surface"), muted: v("--c-surface-muted") },
        frame: v("--c-frame"),
        ink: { DEFAULT: v("--c-text"), muted: v("--c-muted") },
        line: v("--c-border"),
        ok: v("--c-success"),
        warn: v("--c-warning"),
        bad: v("--c-danger"),
        nav: { bg: v("--c-nav-bg"), fg: v("--c-nav-fg") },
      },
      borderRadius: { tok: "var(--radius)" },
      fontFamily: { sans: ["var(--font-sans)"] },
      height: { row: "var(--density-row)" },
    },
  },
  plugins: [],
};
export default config;
