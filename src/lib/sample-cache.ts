/**
 * Saved readings for the built-in sample event.
 *
 * The five sample supplier files never change, so re-reading them with the model on every
 * "Try it with a sample event" just spends API credit. These are real model outputs captured
 * once (scripts/build-sample-cache.py). They are used ONLY when all of these hold:
 *   - the event is a demo event,
 *   - its lines still match the sample manifest exactly (nobody edited them),
 *   - the response's files are byte-identical (SHA-256) to the sample files,
 *   - the saved reading was made with the current extraction version.
 * Anything else, including every file a user uploads, is read live by the model.
 * Set DISABLE_SAMPLE_CACHE=1 to always read live.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { EXTRACTION_VERSION, type ExtractionOutput } from "./ai/extract";
import type { RfqLine } from "./types";

const DIR = path.join(process.cwd(), "sample-data", "cached-extractions");

type Index = { line_signature: string; entries: { id: string; file_sha256: string[]; extraction_version: string }[] };

let index: Index | null | undefined;
function loadIndex(): Index | null {
  if (index !== undefined) return index;
  try {
    index = JSON.parse(fs.readFileSync(path.join(DIR, "index.json"), "utf8"));
  } catch {
    index = null;
  }
  return index ?? null;
}

/** Same signature as the build script: sha256 of compact JSON [[line_no, description], ...] sorted by line_no. */
function lineSignature(lines: Pick<RfqLine, "line_no" | "description">[]) {
  const sorted = [...lines].sort((a, b) => a.line_no - b.line_no).map((l) => [l.line_no, l.description]);
  return crypto.createHash("sha256").update(JSON.stringify(sorted)).digest("hex");
}

export function sha256(buf: Buffer) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

export function findSampleReading(p: { isDemo: boolean; lines: RfqLine[]; fileSha256: string[] }): { id: string; output: ExtractionOutput } | null {
  if (!p.isDemo || process.env.DISABLE_SAMPLE_CACHE === "1") return null;
  const idx = loadIndex();
  if (!idx || lineSignature(p.lines) !== idx.line_signature) return null;
  const key = [...p.fileSha256].sort().join(",");
  const hit = idx.entries.find((e) => e.extraction_version === EXTRACTION_VERSION && [...e.file_sha256].sort().join(",") === key);
  if (!hit) return null;
  try {
    return { id: hit.id, output: JSON.parse(fs.readFileSync(path.join(DIR, `${hit.id}.json`), "utf8")) };
  } catch {
    return null;
  }
}
