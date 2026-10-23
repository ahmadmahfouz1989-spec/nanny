"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { request } from "@/lib/request";
import { ui } from "@/lib/ui";

const RESEND_WAIT_S = 30;

/**
 * "Enter the 6-digit code we emailed you" -- finishing an email sign-up
 * without leaving the app (the email's link would open the browser and
 * sign in there instead). Used right after sign-up, and from login when
 * the account's email was never confirmed. Sends you on to `next`.
 */
export default function EmailCodeForm({ email, next = "/welcome" }: { email: string; next?: string }) {
  const t = useTranslations("Auth");
  const router = useRouter();
  const [code, setCode] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(RESEND_WAIT_S);
  const [resent, setResent] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (wait <= 0) return;
    const id = window.setTimeout(() => setWait((w) => w - 1), 1000);
    return () => window.clearTimeout(id);
  }, [wait]);

  async function verify(value: string) {
    if (checking || value.length !== 6) return;
    setChecking(true);
    setError(null);
    const res = await request("/api/auth/verify-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code: value }),
    });
    if (!res || !res.ok) {
      setChecking(false);
      setError(t("codeWrong"));
      setCode("");
      inputRef.current?.focus();
      return;
    }
    // Signed in now (the server set the session) -- fresh render as them.
    router.replace(next);
    router.refresh();
  }

  async function resend() {
    setError(null);
    setResent(false);
    const { error: resendError } = await createClient().auth.resend({ type: "signup", email });
    if (resendError) {
      setError(t("genericError"));
      return;
    }
    setResent(true);
    setWait(RESEND_WAIT_S);
  }

  return (
    <div className="text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-secondary-soft text-secondary">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M4 6h16v12H4V6Zm0 0 8 7 8-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <h1 className="font-display text-2xl font-semibold mb-2">{t("codeTitle")}</h1>
      <p className="text-muted text-sm mb-5">
        {t.rich("codeBody", { email, mark: (chunks) => <span className="text-ink">{chunks}</span> })}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void verify(code);
        }}
        className="flex flex-col gap-3"
      >
        <input
          ref={inputRef}
          autoFocus
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={6}
          aria-label={t("codeLabel")}
          placeholder="••••••"
          value={code}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, "").slice(0, 6);
            setCode(digits);
            // Six digits typed (or pasted, or filled in from the email by
            // the phone) is the whole job -- no button press needed.
            if (digits.length === 6) void verify(digits);
          }}
          className={ui.input + " text-center font-display text-2xl tracking-[0.5em] py-3!"}
        />
        {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
        <button type="submit" disabled={checking || code.length !== 6} className={ui.buttonPrimary + " w-full"}>
          {checking ? t("codeChecking") : t("codeContinue")}
        </button>
      </form>
      <p className="mt-4 text-xs text-muted">
        {resent && <span className="block mb-1 text-secondary">{t("codeResent")}</span>}
        {wait > 0 ? (
          t("codeResendIn", { seconds: wait })
        ) : (
          <button type="button" onClick={resend} className={ui.link}>
            {t("codeResend")}
          </button>
        )}
      </p>
      <p className="mt-2 text-xs text-muted">{t("codeOrLink")}</p>
    </div>
  );
}
