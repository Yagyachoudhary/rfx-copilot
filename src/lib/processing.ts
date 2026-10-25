import { after } from "next/server";
import type { AppContext } from "./context";
import { processResponse, tokenClient } from "./pipeline";

/** Kick off processing without blocking the request; the UI polls status from the database. */
export async function startProcessing(ctx: AppContext, responseId: string) {
  const {
    data: { session },
  } = await ctx.supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Session expired — sign in again");
  await ctx.supabase.from("supplier_responses").update({ status: "parsing", status_detail: "Queued", error: null }).eq("id", responseId);
  const token = session.access_token;
  const actor = { orgId: ctx.orgId, userId: ctx.user.id, email: ctx.user.email };
  after(async () => {
    try {
      await processResponse(tokenClient(token), actor, responseId);
    } catch (e) {
      console.error("[processing]", responseId, e);
    }
  });
}
