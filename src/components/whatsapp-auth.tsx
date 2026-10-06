"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { request, getJson } from "@/lib/request";
import { trackMetaEvent } from "@/components/meta-pixel";
import { ui } from "@/lib/ui";
import { internationalNumber } from "@/lib/phone";

// Most users are in Lebanon; the rest of the list covers where the
// diaspora and foreign workers commonly have numbers.
const COUNTRY_CODES = ["961", "971", "966", "974", "965", "973", "968", "962", "20", "33", "49", "44", "1", "61", "63", "94", "251", "234", "880", "977", "91"];
const RESEND_AFTER_SECONDS = 30;

function WhatsAppIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="#25D366" aria-hidden>
      <path d="M12.04 2c-5.5 0-9.96 4.46-9.96 9.96 0 1.76.46 3.48 1.34 5L2 22l5.2-1.36a9.9 9.9 0 0 0 4.84 1.24h.01c5.5 0 9.96-4.46 9.96-9.96S17.54 2 12.04 2Zm5.8 14.13c-.24.68-1.4 1.32-1.94 1.36-.5.04-.96.22-3.22-.68-2.72-1.08-4.44-3.86-4.58-4.04-.13-.18-1.1-1.46-1.1-2.78 0-1.32.7-1.98.94-2.24.24-.26.52-.32.7-.32l.5.01c.16 0 .38-.06.6.46.24.56.8 1.96.87 2.1.07.14.12.3.02.48-.1.18-.14.3-.28.46-.14.16-.3.36-.42.48-.14.14-.28.3-.12.58.16.28.72 1.18 1.54 1.9 1.06.94 1.94 1.24 2.22 1.38.28.14.44.12.6-.07.16-.18.7-.8.88-1.08.18-.28.36-.24.6-.14.24.1 1.56.74 1.82.87.26.14.44.2.5.32.06.12.06.68-.18 1.36Z" />
    </svg>
  );
}

/**
 * "Continue with WhatsApp": a phone number, then the 6-digit code that
 * arrives on WhatsApp (sent by /api/auth/sms-hook). Works for both signing
 * up and logging in -- Supabase creates the account on first use, like the
 * Google button.
 */
// Off until WhatsApp delivery is set up end to end (Meta + the Supabase Send
// SMS hook + the WHATSAPP_* settings) -- otherwise the button would only fail.
const ENABLED = process.env.NEXT_PUBLIC_WHATSAPP_AUTH === "on";

export default function WhatsAppAuth(props: { mode: "login" | "signup"; next?: string | null }) {
  return ENABLED ? <WhatsAppAuthPanel {...props} /> : null;
}

function WhatsAppAuthPanel({ mode, next = null }: { mode: "login" | "signup"; next?: string | null }) {
  const t = useTranslations("WhatsAppAuth");
  const locale = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
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
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      phone: `+${target}`,
      options: { shouldCreateUser: true, data: { preferred_language: locale } },
    });
    setBusy(false);
    if (error) {
      setError(/rate|too many|seconds/i.test(error.message) ? t("tooManyCodes") : t("sendFailed"));
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
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({ phone: `+${phone}`, token: code, type: "sms" });
    if (error) {
      setBusy(false);
      setError(/expired/i.test(error.message) ? t("codeExpired") : t("wrongCode"));
      return;
    }

    request("/api/auth/log-login", { method: "POST" });
    const verified = await getJson<{ newAccount?: boolean }>("/api/auth/phone-verified", { method: "POST" });
    if (verified?.newAccount) trackMetaEvent("CompleteRegistration");

    // Same suspended-account check as the password login.
    const me = await getJson<{ user?: { status?: string } }>("/api/auth/me");
    if (me?.user?.status === "suspended") {
      await supabase.auth.signOut();
      setBusy(false);
      setError(t("suspended"));
      return;
    }

    router.push(next ?? (verified?.newAccount ? "/categories" : "/dashboard"));
    router.refresh();
  }

  if (!open) {
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={ui.buttonSecondary + " mt-3 w-full gap-2"}
        >
          <WhatsAppIcon className="h-5 w-5" />
          {t("continue")}
        </button>
        {mode === "signup" && (
          <p className="mt-2 text-center text-[11px] text-muted">
            {t.rich("termsNote", {
              terms: (chunks) => (
                <Link href="/terms" target="_blank" className={ui.link}>
                  {chunks}
                </Link>
              ),
            })}
          </p>
        )}
      </>
    );
  }

  return (
    <div className="mt-3 rounded-2xl border border-border p-4">
      <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <WhatsAppIcon className="h-5 w-5" />
        {phone ? t("codeTitle") : t("phoneTitle")}
      </p>

      {!phone ? (
        <form onSubmit={submitNumber} className="flex flex-col gap-3">
          <div className="flex gap-2" dir="ltr">
            <select
              aria-label={t("countryCode")}
              className={ui.select + " w-28! shrink-0"}
              value={countryCode}
              onChange={(e) => setCountryCode(e.target.value)}
            >
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
      ) : (
        <form onSubmit={submitCode} className="flex flex-col gap-3">
          <p className="text-xs text-muted">
            {t.rich("codeSentTo", { phone: `+${phone}`, mark: (chunks) => <span dir="ltr" className="font-semibold text-ink">{chunks}</span> })}
          </p>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
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
            <button
              type="button"
              onClick={() => {
                setPhone(null);
                setError(null);
              }}
              className={ui.link}
            >
              {t("changeNumber")}
            </button>
            <button
              type="button"
              onClick={() => sendCode(phone)}
              disabled={busy || resendIn > 0}
              className={resendIn > 0 ? "text-muted" : ui.link}
            >
              {resendIn > 0 ? t("resendIn", { seconds: resendIn }) : t("resend")}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
