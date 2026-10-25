"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Mail, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { RotatingVisual } from "@/components/StepShowcase";

const RESEND_SECONDS = 60; // Supabase allows one code per email per 60 s by default

/** Turn Supabase auth errors into plain sentences. */
function friendly(err: any): string {
  const m = String(err?.message ?? err ?? "");
  if (/not authorized/i.test(m)) return "This email can't receive codes yet: the app's email sender isn't set up. Ask the owner to add custom SMTP in Supabase.";
  if (/rate limit|too many|after \d+ seconds/i.test(m)) return "Too many codes requested. Wait a minute and try again.";
  if (/expired|invalid|otp/i.test(m)) return "That code didn't work. It may have expired or have a typo. Check it, or send a new one.";
  if (/signups not allowed/i.test(m)) return "New sign-ups are switched off for this workspace.";
  return m || "Something went wrong. Please try again.";
}

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  useEffect(() => {
    if (step === "code") codeRef.current?.focus();
  }, [step]);

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { error } = await createClient().auth.signInWithOtp({
        email: email.trim(),
        // New emails get an account automatically. The email may also carry a link; it lands on /auth/callback.
        options: { shouldCreateUser: true, emailRedirectTo: `${location.origin}/auth/callback` },
      });
      if (error) throw error;
      setStep("code");
      setCode("");
      setWait(RESEND_SECONDS);
    } catch (err) {
      setError(friendly(err));
    } finally {
      setBusy(false);
    }
  }

  async function verify(token: string) {
    setBusy(true);
    setError(null);
    try {
      const { error } = await createClient().auth.verifyOtp({ email: email.trim(), token, type: "email" });
      if (error) throw error;
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(friendly(err));
      setBusy(false);
    }
  }

  function onCode(v: string) {
    const digits = v.replace(/\D/g, "").slice(0, 10);
    setCode(digits);
    // Supabase codes are 6 digits by default (configurable up to 10). Submit as soon as a full code is in.
    if (digits.length === 6 && !busy) verify(digits);
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

        {step === "email" ? (
          <form onSubmit={sendCode} className="mt-8 space-y-4">
            <div>
              <label className="label" htmlFor="email">Work email</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2" />
                <input id="email" className="input h-11 pl-9" type="email" required autoFocus placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              </div>
            </div>
            {error && <div className="chip-bad chip !rounded-md !whitespace-normal !text-[12px] w-full">{error}</div>}
            <button className="btn-primary w-full h-11 text-[14px] rounded-xl" disabled={busy || !email}>
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              Email me a sign-in code
            </button>
            <p className="text-[12px] text-ink-muted text-center">No password needed. New here? The same code creates your account.</p>
          </form>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (code.length >= 6) verify(code);
            }}
            className="mt-8 space-y-4"
          >
            <div className="flex items-start gap-3 rounded-xl border border-line bg-white p-3">
              <span className="w-8 h-8 rounded-lg grid place-items-center bg-accent/10 text-accent shrink-0"><ShieldCheck className="w-4 h-4" /></span>
              <div className="text-[13px] leading-snug">
                We sent a code to <b className="break-all">{email}</b>.
                <div className="text-ink-muted text-[12px] mt-0.5">Check spam if it isn&apos;t there in a minute.</div>
              </div>
            </div>
            <div>
              <label className="label" htmlFor="code">Sign-in code</label>
              <input
                id="code"
                ref={codeRef}
                className="input h-12 text-center text-[22px] font-semibold tracking-[0.45em] tabular-nums"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="••••••"
                value={code}
                onChange={(e) => onCode(e.target.value)}
                onPaste={(e) => {
                  e.preventDefault();
                  onCode(e.clipboardData.getData("text"));
                }}
              />
            </div>
            {error && <div className="chip-bad chip !rounded-md !whitespace-normal !text-[12px] w-full">{error}</div>}
            <button className="btn-primary w-full h-11 text-[14px] rounded-xl" disabled={busy || code.length < 6}>
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              Sign in
            </button>
            <div className="flex items-center justify-between text-[13px]">
              <button type="button" className="btn-ghost !px-2" onClick={() => { setStep("email"); setError(null); }}>
                <ArrowLeft className="w-3.5 h-3.5" /> Different email
              </button>
              <button type="button" className="btn-ghost !px-2" disabled={busy || wait > 0} onClick={() => sendCode()}>
                {wait > 0 ? `Resend code in ${wait}s` : "Resend code"}
              </button>
            </div>
          </form>
        )}
      </div>
      <div className="hidden lg:block max-w-[560px] w-full">
        <RotatingVisual />
      </div>
    </div>
  );
}
