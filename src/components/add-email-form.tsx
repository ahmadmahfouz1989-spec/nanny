"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { ui } from "@/lib/ui";
import { EMAIL_CODE_LENGTH } from "@/components/email-code-form";

// Supabase's own wait between emails to one address is a minute by default.
const RESEND_AFTER_SECONDS = 60;

/**
 * Adds a verified email to a WhatsApp account, so signing in with that email
 * opens this account instead of making a second one. Supabase refuses an
 * email another account already holds, and only saves it once the code from
 * that inbox comes back.
 */
export default function AddEmailForm({ onDone }: { onDone: () => void }) {
  const t = useTranslations("AccountDetails");
  const [value, setValue] = useState("");
  const [email, setEmail] = useState<string | null>(null); // set once a code was sent
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  async function sendCode(target: string) {
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.updateUser({ email: target });
    setBusy(false);
    if (error) {
      if (error.code === "email_exists" || /already|exists|registered/i.test(error.message)) setError(t("emailTaken"));
      else if (error.code === "email_address_invalid" || error.code === "validation_failed") setError(t("emailInvalid"));
      else setError(/rate|too many|seconds/i.test(error.message) ? t("emailTooMany") : t("emailSendFailed"));
      return;
    }
    setEmail(target);
    setCode("");
    setResendIn(RESEND_AFTER_SECONDS);
  }

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    const target = value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) {
      setError(t("emailInvalid"));
      return;
    }
    await sendCode(target);
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    if (!email || code.length !== EMAIL_CODE_LENGTH) return;
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.verifyOtp({ email, token: code, type: "email_change" });
    setBusy(false);
    if (error) {
      setError(t("emailWrongCode"));
      return;
    }
    onDone();
  }

  if (!email) {
    return (
      <form onSubmit={submitEmail} className="flex flex-col gap-3">
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          aria-label={t("email")}
          placeholder={t("emailPlaceholder")}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className={ui.input}
          dir="ltr"
        />
        {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
        <button type="submit" disabled={busy || !value.trim()} className={ui.buttonPrimary + " w-full"}>
          {busy ? t("emailSending") : t("emailSendCode")}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={submitCode} className="flex flex-col gap-3">
      <p className="text-xs text-muted">
        {t.rich("emailCodeSent", { email, mark: (chunks) => <bdi dir="ltr" className="font-semibold text-ink break-all">{chunks}</bdi> })}
      </p>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        aria-label={t("emailCodeLabel")}
        maxLength={EMAIL_CODE_LENGTH}
        placeholder={"•".repeat(EMAIL_CODE_LENGTH)}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, EMAIL_CODE_LENGTH))}
        className={ui.input + " text-center text-lg tracking-[0.4em]"}
        dir="ltr"
        autoFocus
      />
      {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      <button type="submit" disabled={busy || code.length !== EMAIL_CODE_LENGTH} className={ui.buttonPrimary + " w-full"}>
        {busy ? t("emailChecking") : t("emailConfirm")}
      </button>
      <div className="flex items-center justify-between text-xs">
        <button type="button" onClick={() => { setEmail(null); setError(null); }} className={ui.link}>
          {t("emailChange")}
        </button>
        <button type="button" onClick={() => sendCode(email)} disabled={busy || resendIn > 0} className={resendIn > 0 ? "text-muted" : ui.link}>
          {resendIn > 0 ? t("emailResendIn", { seconds: resendIn }) : t("emailResend")}
        </button>
      </div>
    </form>
  );
}
