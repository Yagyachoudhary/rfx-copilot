import fs from "node:fs"; import path from "node:path";
import { findSampleReading, sha256 } from "../src/lib/sample-cache";
import { readManifest } from "../src/lib/responses";
const m = readManifest();
const lines = m.lines.map((l: any) => ({ id: `L${l.line_no}`, ...l }));
for (const s of m.sample_responses) {
  const shas = s.files.map((f) => sha256(fs.readFileSync(path.join("sample-data", f.path))));
  const hit = findSampleReading({ isDemo: true, lines, fileSha256: shas });
  console.log(s.supplier, s.version, hit ? `HIT ${hit.id} ${hit.output.lines.length} lines` : "MISS");
}
const edited = lines.map((l: any, i: number) => (i === 0 ? { ...l, description: l.description + " (edited)" } : l));
console.log("edited lines →", findSampleReading({ isDemo: true, lines: edited, fileSha256: m.sample_responses[0].files.map((f) => sha256(fs.readFileSync(path.join("sample-data", f.path)))) }) ? "HIT (bad)" : "MISS (good)");
console.log("non-demo →", findSampleReading({ isDemo: false, lines, fileSha256: [] }) ? "HIT (bad)" : "MISS (good)");
