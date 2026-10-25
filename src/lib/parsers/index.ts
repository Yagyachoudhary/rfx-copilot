/**
 * File-type-specific preparation. Structured formats are turned into text with explicit
 * coordinates (sheet/cell, paragraph numbers, line numbers) so every extracted value can point
 * back to its source. PDFs and images go to the model natively (document / vision input).
 */
import ExcelJS from "exceljs";
import mammoth from "mammoth";
import sharp from "sharp";

export type DetectedFormat = "xlsx" | "csv" | "pdf" | "docx" | "image" | "email" | "text" | "unsupported";

export function detectFormat(fileName: string, mime?: string | null): DetectedFormat {
  const n = fileName.toLowerCase();
  if (n.endsWith(".xlsx") || mime?.includes("spreadsheetml")) return "xlsx";
  if (n.endsWith(".csv") || mime === "text/csv") return "csv";
  if (n.endsWith(".pdf") || mime === "application/pdf") return "pdf";
  if (n.endsWith(".docx") || mime?.includes("wordprocessingml")) return "docx";
  if (/\.(jpe?g|png|webp|heic|gif)$/.test(n) || mime?.startsWith("image/")) return "image";
  if (n.endsWith(".eml") || mime === "message/rfc822") return "email";
  if (n.endsWith(".txt") || mime?.startsWith("text/")) return "text";
  if (n.endsWith(".xls") || n.endsWith(".doc")) return "unsupported";
  return "unsupported";
}

export type PreparedPart =
  | { kind: "text"; label: string; text: string; notes: string[] }
  | { kind: "pdf"; label: string; base64: string; notes: string[] }
  | { kind: "image"; label: string; base64: string; mediaType: "image/jpeg" | "image/png"; notes: string[] };

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    const o = v as any;
    if (o.richText) return o.richText.map((t: any) => t.text).join("");
    if (o.result !== undefined) return String(o.result);
    if (o.text) return String(o.text);
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    return JSON.stringify(v);
  }
  return String(v).replace(/\s+/g, " ").trim();
}

export async function prepareFile(buf: Buffer, fileName: string, format: DetectedFormat, label: string): Promise<PreparedPart> {
  const notes: string[] = [];
  switch (format) {
    case "xlsx": {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buf as any);
      const out: string[] = [];
      wb.eachSheet((ws) => {
        out.push(`=== Sheet "${ws.name}" ===`);
        ws.eachRow({ includeEmpty: false }, (row, r) => {
          const cells: string[] = [];
          row.eachCell({ includeEmpty: false }, (cell) => {
            const t = cellText(cell.value);
            if (t) cells.push(`${cell.address}=${JSON.stringify(t)}`);
          });
          if (cells.length) out.push(`R${r}: ${cells.join(" | ")}`);
        });
      });
      notes.push(`xlsx parsed: ${wb.worksheets.length} sheet(s)`);
      return { kind: "text", label, text: out.join("\n"), notes };
    }
    case "csv": {
      const lines = buf.toString("utf8").split(/\r?\n/);
      return { kind: "text", label, text: lines.map((l, i) => `R${i + 1}: ${l}`).join("\n"), notes: ["csv parsed"] };
    }
    case "docx": {
      const paras = await docxParagraphs(buf);
      notes.push(`docx parsed: ${paras.length} paragraphs/rows`);
      return { kind: "text", label, text: paras.map((p) => `[¶${p.n}]${p.kind === "heading" ? " (heading)" : p.kind === "row" ? ` (table row ${p.row})` : ""} ${p.text}`).join("\n"), notes };
    }
    case "email":
    case "text": {
      let text = buf.toString("utf8");
      if (format === "email") {
        // minimal RFC822: keep key headers + plain body; strip quoted-printable soft breaks
        text = text.replace(/=\r?\n/g, "");
      }
      const lines = text.split(/\r?\n/);
      return { kind: "text", label, text: lines.map((l, i) => `[line ${i + 1}] ${l}`).join("\n"), notes: [`${format} parsed: ${lines.length} lines`] };
    }
    case "pdf": {
      if (buf.length > 25 * 1024 * 1024) throw new Error("PDF larger than 25 MB");
      return { kind: "pdf", label, base64: buf.toString("base64"), notes: ["pdf sent to model as a document (text + page images)"] };
    }
    case "image": {
      const img = sharp(buf, { failOn: "none" }).rotate(); // honour EXIF orientation
      const meta = await img.metadata();
      const out = await img
        .resize({ width: 2200, height: 2200, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 88 })
        .toBuffer();
      notes.push(`image ${meta.width}x${meta.height} → resized for vision, EXIF orientation applied`);
      return { kind: "image", label, base64: out.toString("base64"), mediaType: "image/jpeg", notes };
    }
    default:
      throw new Error(`Unsupported file type for ${fileName}. Supported: xlsx, csv, pdf, docx, jpg/png, eml/txt.`);
  }
}

export type DocPara = { n: number; kind: "p" | "heading" | "row"; text: string; row?: number; cells?: string[] };

/** Numbered paragraphs (tables as rows). Shared by the extractor and the source viewer so ¶ numbers line up. */
export async function docxParagraphs(buf: Buffer): Promise<DocPara[]> {
  const { value: html } = await mammoth.convertToHtml({ buffer: buf });
  const out: DocPara[] = [];
  let p = 0;
  const blockRe = /<(p|h[1-6]|li|table)[^>]*>([\s\S]*?)<\/\1>/g;
  const strip = (s: string) =>
    s.replace(/<br\s*\/?>/g, " ").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(html))) {
    if (m[1] === "table") {
      const rows = m[2].match(/<tr[^>]*>[\s\S]*?<\/tr>/g) ?? [];
      rows.forEach((row, ri) => {
        const cells = (row.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/g) ?? []).map(strip);
        out.push({ n: ++p, kind: "row", row: ri + 1, text: cells.join(" | "), cells });
      });
    } else {
      const t = strip(m[2]);
      if (t) out.push({ n: ++p, kind: m[1].startsWith("h") ? "heading" : "p", text: t });
    }
  }
  return out;
}

export async function xlsxGrid(buf: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as any);
  const sheets: { name: string; maxCol: number; rows: { r: number; cells: Record<string, string> }[] }[] = [];
  wb.eachSheet((ws) => {
    const rows: { r: number; cells: Record<string, string> }[] = [];
    let maxCol = 0;
    ws.eachRow({ includeEmpty: false }, (row, r) => {
      const cells: Record<string, string> = {};
      row.eachCell({ includeEmpty: false }, (cell, c) => {
        const t = cellText(cell.value);
        if (t) {
          cells[cell.address.replace(/\d+$/, "")] = t;
          maxCol = Math.max(maxCol, c);
        }
      });
      rows.push({ r, cells });
    });
    sheets.push({ name: ws.name, maxCol, rows });
  });
  return sheets;
}
