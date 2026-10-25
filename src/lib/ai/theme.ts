import sharp from "sharp";
import { callTool, MODELS } from "./client";
import { DEFAULT_THEME, type ThemeTokens } from "../theme";

/** Deterministic palette sampling (coarse colour histogram) — gives the model grounded HEX candidates. */
export async function samplePalette(buf: Buffer, k = 12) {
  const { data, info } = await sharp(buf).rotate().resize(160, 160, { fit: "inside" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const counts = new Map<string, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const key = `${r >> 4}-${g >> 4}-${b >> 4}`;
    const e = counts.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    e.n++; e.r += r; e.g += g; e.b += b;
    counts.set(key, e);
  }
  const total = data.length / info.channels;
  const hex = (v: number) => Math.round(v).toString(16).padStart(2, "0");
  return [...counts.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, k)
    .map((e) => ({ hex: `#${hex(e.r / e.n)}${hex(e.g / e.n)}${hex(e.b / e.n)}`.toUpperCase(), share: Math.round((e.n / total) * 1000) / 10 }));
}

export type ThemeProposal = {
  tokens: Partial<ThemeTokens>;
  rationale: string;
  per_token_notes: { token: string; note: string }[];
  warnings: string[];
};

export async function proposeTheme(img: Buffer) {
  const palette = await samplePalette(img);
  const jpeg = await sharp(img).rotate().resize(1600, 1600, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
  const colorProps = Object.fromEntries(
    ["brandStart", "brandMid", "brandEnd", "primary", "accent", "bg", "surface", "surfaceMuted", "frame", "text", "muted", "border", "success", "warning", "danger"].map((k) => [
      k,
      { type: "string", description: "#RRGGBB" },
    ]),
  );
  return callTool<ThemeProposal>({
    model: MODELS.analyst,
    system: `You infer a design-token set for an enterprise procurement web app from a screenshot of the customer's existing portal / brand screen.
- Use the sampled pixel colours (with their share of the image) as ground truth for HEX values; pick, don't invent.
- Brand gradient (start/mid/end) is used for the navigation rail and a few feature panels; primary is for primary buttons; accent for links/focus.
- Keep data screens light and high-contrast: bg should be a light neutral, surface usually white, text very dark.
- Status colours (success/warning/danger) must remain recognisable as green/amber/red even if the brand lacks them.
- Choose typography from: inter | jakarta | plex | system; density compact|comfortable; nav brand|light|dark; radius 0–20 px.
- Report anything that could hurt readability in warnings. This is AI-assisted and approximate; say so in the rationale if confidence is low.`,
    content: [
      { type: "text", text: `Sampled colours (hex, % of pixels): ${palette.map((p) => `${p.hex} ${p.share}%`).join(", ")}\nDefault tokens for reference: ${JSON.stringify(DEFAULT_THEME)}` },
      { type: "image", source: { type: "base64", media_type: "image/jpeg", data: jpeg.toString("base64") } },
    ],
    tool: {
      name: "propose_theme",
      description: "Return the proposed tokens.",
      input_schema: {
        type: "object",
        properties: {
          tokens: {
            type: "object",
            properties: {
              ...colorProps,
              radius: { type: "integer" },
              density: { type: "string", enum: ["compact", "comfortable"] },
              font: { type: "string", enum: ["inter", "jakarta", "plex", "system"] },
              nav: { type: "string", enum: ["brand", "light", "dark"] },
            },
            required: ["brandStart", "brandMid", "brandEnd", "primary", "accent", "bg", "surface", "text", "muted", "border"],
          },
          rationale: { type: "string" },
          per_token_notes: { type: "array", items: { type: "object", properties: { token: { type: "string" }, note: { type: "string" } }, required: ["token", "note"] } },
          warnings: { type: "array", items: { type: "string" } },
        },
        required: ["tokens", "rationale", "warnings"],
      },
    },
    maxTokens: 3000,
  }).then((r) => ({ ...r, palette }));
}
