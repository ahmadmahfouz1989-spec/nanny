"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { ui } from "@/lib/ui";
import { internationalNumber } from "@/lib/phone";
import { COUNTRY_CODES, RESEND_AFTER_SECONDS } from "@/components/whatsapp-auth";

/**
 * Adds a verified WhatsApp number to the account already signed in, so
 * "Continue with WhatsApp" opens this account instead of making a second
 * one. Supabase refuses a number another account already holds.
 */
export default function AddPhoneForm({ onDone }: { onDone: () => void }) {
  const t = useTranslations("WhatsAppAuth");
  const ta = useTranslations("AccountDetails");
  const [countryCode, setCountryCode] = useState("961");
  const [number, setNumber] = useState("");
  const [phone, setPhone] = useState<string | null>(null); // set once a code was sent
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
    const { error } = await createClient().auth.updateUser({ phone: `+${target}` });
    setBusy(false);
    if (error) {
      if (error.code === "phone_exists" || /already|exists|registered/i.test(error.message)) setError(ta("phoneTaken"));
      else setError(/rate|too many|seconds/i.test(error.message) ? t("tooManyCodes") : t("sendFailed"));
      return;
    }
    setPhone(target);
    setCode("");
    setResendIn(RESEND_AFTER_SECONDS);
  }

  async function submitNumber(e: React.FormEvent) {
    e.preventDefault();
    const target = internationalNumber(countryCode, number);
    if (!target) {
      setError(t("invalidNumber"));
      return;
    }
    await sendCode(target);
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    if (!phone || code.length < 6) return;
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.verifyOtp({ phone: `+${phone}`, token: code, type: "phone_change" });
    setBusy(false);
    if (error) {
      // Supabase says the same thing for a wrong code and an expired one.
      setError(t("wrongCode"));
      return;
    }
    onDone();
  }

  if (!phone) {
    return (
      <form onSubmit={submitNumber} className="flex flex-col gap-3">
        <div className="flex gap-2" dir="ltr">
          <select aria-label={t("countryCode")} className={ui.select + " w-28! shrink-0"} value={countryCode} onChange={(e) => setCountryCode(e.target.value)}>
            {COUNTRY_CODES.map((c) => (
              <option key={c} value={c}>
                +{c}
              </option>
            ))}
          </select>
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            aria-label={t("phoneTitle")}
            placeholder={t("numberPlaceholder")}
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            className={ui.input + " min-w-0 flex-1"}
          />
        </div>
        <p className="text-xs text-muted">{t("phoneHint")}</p>
        {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
        <button type="submit" disabled={busy || !number.trim()} className={ui.buttonPrimary + " w-full"}>
          {busy ? t("sending") : t("sendCode")}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={submitCode} className="flex flex-col gap-3">
      <p className="text-xs text-muted">
        {t.rich("codeSentTo", { phone: `+${phone}`, mark: (chunks) => <span dir="ltr" className="font-semibold text-ink">{chunks}</span> })}
      </p>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        aria-label={t("codeTitle")}
        maxLength={6}
        placeholder="••••••"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
        className={ui.input + " text-center text-lg tracking-[0.4em]"}
        dir="ltr"
        autoFocus
      />
      {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      <button type="submit" disabled={busy || code.length < 6} className={ui.buttonPrimary + " w-full"}>
        {busy ? t("verifying") : t("verify")}
      </button>
      <div className="flex items-center justify-between text-xs">
        <button type="button" onClick={() => { setPhone(null); setError(null); }} className={ui.link}>
          {t("changeNumber")}
        </button>
        <button type="button" onClick={() => sendCode(phone)} disabled={busy || resendIn > 0} className={resendIn > 0 ? "text-muted" : ui.link}>
          {resendIn > 0 ? t("resendIn", { seconds: resendIn }) : t("resend")}
        </button>
      </div>
    </form>
  );
}
