import { getContext } from "@/lib/context";
import { CreateRfx } from "./CreateRfx";

export const dynamic = "force-dynamic";

export default async function NewRfx({ searchParams }: { searchParams: Promise<{ brief?: string }> }) {
  const { brief } = await searchParams;
  const ctx = await getContext();
  const { data: suppliers } = await ctx.supabase.from("suppliers").select("id, name, location").order("name");
  return <CreateRfx suppliers={suppliers ?? []} initialBrief={brief} />;
}
