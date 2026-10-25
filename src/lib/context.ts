import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import { DEFAULT_THEME, sanitizeTokens, type ThemeTokens } from "./theme";

export type AppContext = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  user: { id: string; email: string | null };
  orgId: string;
  orgName: string;
  plan: string;
  role: "admin" | "buyer" | "viewer";
  theme: { tokens: ThemeTokens; mode: "light" | "dark"; logoUrl: string | null; version: number | null };
};

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Resolve user + organization. `mode: "page"` redirects; `mode: "api"` throws HttpError. */
export async function getContext(mode: "page" | "api" = "page"): Promise<AppContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    if (mode === "page") redirect("/login");
    throw new HttpError(401, "Not signed in");
  }
  const { data: mem } = await supabase
    .from("memberships")
    .select("org_id, role, organizations(name, plan)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!mem) {
    if (mode === "page") redirect("/onboarding");
    throw new HttpError(403, "No workspace for this user");
  }
  const org = (mem as any).organizations ?? {};
  const { data: themeRow } = await supabase
    .from("organization_theme")
    .select("tokens, mode, logo_path, version")
    .eq("org_id", mem.org_id)
    .eq("status", "applied")
    .order("applied_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  let logoUrl: string | null = null;
  if (themeRow?.logo_path) {
    const { data } = await supabase.storage.from("branding").createSignedUrl(themeRow.logo_path, 60 * 60);
    logoUrl = data?.signedUrl ?? null;
  }
  return {
    supabase,
    user: { id: user.id, email: user.email ?? null },
    orgId: mem.org_id,
    orgName: org.name ?? "Workspace",
    plan: org.plan ?? "growth",
    role: mem.role as AppContext["role"],
    theme: {
      tokens: themeRow ? sanitizeTokens(themeRow.tokens as any) : DEFAULT_THEME,
      mode: (themeRow?.mode as any) ?? "light",
      logoUrl,
      version: themeRow?.version ?? null,
    },
  };
}

export async function audit(
  ctx: Pick<AppContext, "supabase" | "orgId" | "user">,
  action: string,
  opts: { rfqId?: string | null; entityType?: string; entityId?: string; details?: Record<string, any> } = {},
) {
  await ctx.supabase.from("audit_events").insert({
    org_id: ctx.orgId,
    rfq_id: opts.rfqId ?? null,
    actor_id: ctx.user.id,
    actor_email: ctx.user.email,
    action,
    entity_type: opts.entityType ?? null,
    entity_id: opts.entityId ?? null,
    details: opts.details ?? {},
  });
}
