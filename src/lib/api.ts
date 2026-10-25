import { NextResponse } from "next/server";
import { HttpError } from "./context";

export function jsonError(e: unknown) {
  if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
  const msg = e instanceof Error ? e.message : String(e);
  console.error("[api]", msg);
  return NextResponse.json({ error: msg }, { status: 500 });
}

export function must<T>(res: { data: T | null; error: any }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message ?? res.error}`);
  if (res.data === null) throw new HttpError(404, `${what}: not found`);
  return res.data;
}
