"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "bad" | "ok"; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const sb = createClient();
    try {
      if (mode === "signup") {
        const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: `${location.origin}/auth/callback` } });
        if (error) throw error;
        if (!data.session) {
          setMsg({ tone: "ok", text: "Check your inbox to confirm your email, then sign in. (For demos, you can disable email confirmation in Supabase → Auth → Providers → Email.)" });
          setMode("signin");
          return;
        }
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      router.push("/");
      router.refresh();
    } catch (err: any) {
      setMsg({ tone: "bad", text: err?.message ?? "Sign-in failed" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen grid md:grid-cols-2">
      <div className="hidden md:flex flex-col justify-between p-10 text-white brand-gradient">
        <div className="flex items-center gap-2 font-bold text-lg">
          <span className="w-8 h-8 rounded-lg bg-white/15 grid place-items-center">
            <svg viewBox="0 0 16 16" className="w-4 h-4" fill="currentColor"><path d="M8 1l1.6 4.4L14 7l-4.4 1.6L8 13l-1.6-4.4L2 7l4.4-1.6z" /></svg>
          </span>
          RFx Copilot
        </div>
        <div>
          <h1 className="text-[34px] font-extrabold leading-tight">Kill the quote spreadsheet.</h1>
          <p className="mt-3 text-white/85 max-w-md text-[15px]">
            Draft an RFx, read whatever suppliers send back — Excel, PDF, Word, photos, emails — and decide with every number traced to its source.
          </p>
        </div>
        <div className="text-white/70 text-xs">Demo workspace with fictional suppliers and prices.</div>
      </div>
      <div className="flex items-center justify-center p-6 bg-canvas">
        <form onSubmit={submit} className="card w-full max-w-sm p-6 space-y-4">
          <div>
            <h2 className="text-xl font-bold">{mode === "signin" ? "Sign in" : "Create your account"}</h2>
            <p className="text-ink-muted text-[13px] mt-1">Each account gets its own isolated workspace.</p>
          </div>
          <div>
            <label className="label" htmlFor="email">Work email</label>
            <input id="email" className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </div>
          <div>
            <label className="label" htmlFor="pw">Password</label>
            <input id="pw" className="input" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "signin" ? "current-password" : "new-password"} />
          </div>
          {msg && <div className={msg.tone === "bad" ? "chip-bad chip !rounded-md !whitespace-normal !text-[12px] w-full" : "chip-ok chip !rounded-md !whitespace-normal !text-[12px] w-full"}>{msg.text}</div>}
          <button className="btn-primary w-full h-9" disabled={busy}>
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {mode === "signin" ? "Sign in" : "Create account"}
          </button>
          <button type="button" className="btn-ghost w-full" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
            {mode === "signin" ? "New here? Create an account" : "Have an account? Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
