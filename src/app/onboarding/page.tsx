import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import OnboardingForm from "./OnboardingForm";

export const dynamic = "force-dynamic";

export default async function Onboarding() {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) redirect("/login");
  const { data: mem } = await sb.from("memberships").select("org_id").eq("user_id", user.id).limit(1);
  if (mem?.length) redirect("/");
  return (
    <div className="min-h-screen bg-surface px-4 md:px-8 py-8">
      <OnboardingForm email={user.email ?? ""} />
    </div>
  );
}
