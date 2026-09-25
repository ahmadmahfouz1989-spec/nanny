"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useRouter, Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import AuthCard from "@/components/auth-card";
import GoogleAuthButton from "@/components/google-auth-button";
import { ui } from "@/lib/ui";
import { safeReturnPath } from "@/lib/return-path";

export default function LoginForm() {
  const t = useTranslations("Login");
  const tAuth = useTranslations("Auth");
  const router = useRouter();
  const searchParams = useSearchParams();
  // middleware sets `next` to a locale-prefixed path + query (e.g.
  // /en/feed?post=...) — safeReturnPath strips the locale (the router
  // re-adds it on push) and rejects anything off-site.
  const explicitNext = safeReturnPath(searchParams.get("next"));

  const linkErrorType = searchParams.get("error") === "auth_callback_failed" ? searchParams.get("type") : null;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(() => {
    if (searchParams.get("error") === "account_suspended") return t("accountSuspended");
    // The link may have failed because it was already used (a mail client's
    // link-scanner opening it before the person clicked it is a common
    // cause) or simply expired -- either way, tell them plainly rather than
    // silently dropping them back on a blank login form.
    if (linkErrorType === "recovery") return t("recoveryLinkFailed");
    if (linkErrorType) return t("signupLinkFailed");
    return null;
  });
  // Only the signup-confirmation case gets an inline resend button -- a
  // failed recovery link should go back through "Forgot password?" instead,
  // since that flow doesn't require knowing the (possibly wrong) password.
  const [showResend, setShowResend] = useState(linkErrorType === "signup");
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setShowResend(false);
    setResendState("idle");
    setSubmitting(true);

    const supabase = createClient();

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setSubmitting(false);
      const unconfirmed = error.code === "email_not_confirmed" || /not confirmed/i.test(error.message ?? "");
      setError(unconfirmed ? t("emailNotConfirmed") : t("invalidCredentials"));
      setShowResend(unconfirmed);
      return;
    }

    // Fire-and-forget — never delay navigation for a logging call.
    fetch("/api/auth/log-login", { method: "POST" }).catch(() => {});

    const meRes = await fetch("/api/auth/me");
    const me = await meRes.json().catch(() => null);
    setSubmitting(false);

    if (me?.user?.status === "suspended") {
      await supabase.auth.signOut();
      setError(t("accountSuspended"));
      return;
    }

    router.push(explicitNext ?? "/dashboard");
    router.refresh();
  }

  async function handleResend() {
    if (!email) return;
    setResendState("sending");
    const supabase = createClient();
    const { error } = await supabase.auth.resend({ type: "signup", email });
    setResendState(error ? "error" : "sent");
  }

  return (
    <AuthCard>
      <h1 className="font-display text-2xl font-semibold mb-1">{t("title")}</h1>
      <p className="text-muted text-sm mb-6">{t("subhead")}</p>

      <GoogleAuthButton next={explicitNext} />

      <div className="flex items-center gap-3 my-5">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted">{tAuth("orDivider")}</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <input
          type="email"
          required
          placeholder={tAuth("emailPlaceholder")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={ui.input}
        />
        <input
          type="password"
          required
          placeholder={tAuth("passwordPlaceholder")}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={ui.input}
        />

        {error && (
          <div className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            <p>{error}</p>
            {showResend && (
              <>
                {resendState === "sent" ? (
                  <p className="mt-1 font-medium">{t("resendSent")}</p>
                ) : (
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={!email || resendState === "sending"}
                    className="mt-1 font-medium underline underline-offset-2 disabled:opacity-50"
                  >
                    {resendState === "sending" ? t("resending") : t("resendConfirmation")}
                  </button>
                )}
                {resendState === "error" && <p className="mt-1">{tAuth("genericError")}</p>}
              </>
            )}
          </div>
        )}

        <button type="submit" disabled={submitting} className={ui.buttonPrimary + " w-full"}>
          {submitting ? t("submitting") : t("submit")}
        </button>
      </form>

      <p className="text-xs text-muted mt-5 text-center">
        <Link href="/recover" className={ui.link}>
          {t("forgotPassword")}
        </Link>
      </p>
      <p className="text-xs text-muted mt-2 text-center">
        {t("newHere")}{" "}
        <Link href="/signup" className={ui.link}>
          {t("createAccount")}
        </Link>
      </p>
    </AuthCard>
  );
}
