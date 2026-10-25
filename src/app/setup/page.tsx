export default function Setup() {
  return (
    <div className="min-h-screen grid place-items-center p-6 bg-canvas">
      <div className="card max-w-xl p-6 space-y-3">
        <h1 className="text-xl font-bold">Configuration needed</h1>
        <p className="text-ink-muted">This deployment is missing environment variables. Add them in Vercel → Project → Settings → Environment Variables and redeploy:</p>
        <pre className="bg-surface-muted/60 p-3 rounded text-[12px] overflow-auto">{`NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
ANTHROPIC_API_KEY`}</pre>
        <p className="text-ink-muted text-[13px]">Then run <code>supabase/migrations/0001_schema.sql</code> in the Supabase SQL editor. See README.md.</p>
      </div>
    </div>
  );
}
