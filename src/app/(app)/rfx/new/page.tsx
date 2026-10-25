import { getContext } from "@/lib/context";
import { PageHeader } from "@/components/ui";
import { RfxEditor } from "@/components/RfxEditor";
import { blankState } from "@/lib/rfx-editor-state";

export const dynamic = "force-dynamic";

export default async function NewRfx() {
  const ctx = await getContext();
  const { data: suppliers } = await ctx.supabase.from("suppliers").select("id, name, location").order("name");
  return (
    <div className="max-w-6xl">
      <PageHeader eyebrow="New sourcing event" title="Create RFx" subtitle="Start from a plain-language brief, or fill the form directly. You review and edit everything before it goes out." />
      <RfxEditor suppliers={suppliers ?? []} initial={blankState()} showCopilot />
    </div>
  );
}
