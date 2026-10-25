"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { RotatingVisual } from "@/components/StepShowcase";

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
    <div className="min-h-screen bg-surface grid lg:grid-cols-2 gap-10 items-center px-6 md:px-12 py-10">
      <div className="max-w-md w-full mx-auto lg:mx-0 lg:ml-auto">
        <div className="flex items-center gap-2 font-bold text-[15px] mb-10">
          <span className="w-7 h-7 rounded-lg grid place-items-center text-white" style={{ background: "var(--nav-gradient)" }}>
            <svg viewBox="0 0 16 16" className="w-4 h-4" fill="currentColor"><path d="M8 1l1.6 4.4L14 7l-4.4 1.6L8 13l-1.6-4.4L2 7l4.4-1.6z" /></svg>
          </span>
          RFx Copilot
        </div>
        <h1 className="text-[34px] sm:text-[40px] font-extrabold leading-[1.08] tracking-tight">Quote comparison, without the spreadsheet</h1>
        <p className="mt-3 text-ink-muted text-[15px] leading-relaxed">Suppliers reply in any format. RFx Copilot reads them, lines them up and shows you only what needs a decision.</p>
        <form onSubmit={submit} className="mt-8 space-y-4">
          <div>
            <label className="label" htmlFor="email">Work email</label>
            <input id="email" className="input h-10" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </div>
          <div>
            <label className="label" htmlFor="pw">Password</label>
            <input id="pw" className="input h-10" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "signin" ? "current-password" : "new-password"} />
          </div>
          {msg && <div className={msg.tone === "bad" ? "chip-bad chip !rounded-md !whitespace-normal !text-[12px] w-full" : "chip-ok chip !rounded-md !whitespace-normal !text-[12px] w-full"}>{msg.text}</div>}
          <button className="btn-primary w-full h-11 text-[14px] rounded-xl" disabled={busy}>
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {mode === "signin" ? "Sign in" : "Create free account"}
          </button>
          <button type="button" className="btn-ghost w-full" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
            {mode === "signin" ? "New here? Create an account" : "Have an account? Sign in"}
          </button>
        </form>
      </div>
      <div className="hidden lg:block max-w-[560px] w-full">
        <RotatingVisual />
      </div>
    </div>
  );
}
