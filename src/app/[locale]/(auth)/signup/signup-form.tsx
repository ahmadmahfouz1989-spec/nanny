"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import AuthCard from "@/components/auth-card";
import GoogleAuthButton from "@/components/google-auth-button";
import WhatsAppAuth from "@/components/whatsapp-auth";
import EmailCodeForm from "@/components/email-code-form";
import { useRouter } from "@/i18n/navigation";
import { trackMetaEvent } from "@/components/meta-pixel";
import { ui } from "@/lib/ui";
import { request } from "@/lib/request";

// No category chooses a role at signup -- see signupSchema in
// src/lib/validation/auth.ts. Every account lands on /categories after
// confirming (see the default in src/app/auth/callback/route.ts) and
// picks a category, then a role within it, from there.
export default function SignupForm() {
  const t = useTranslations("Signup");
  const tAuth = useTranslations("Auth");
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!agreed) {
      setError(tAuth("termsRequired"));
      return;
    }

    setSubmitting(true);
    const res = await request("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    setSubmitting(false);

    if (!res || !res.ok) {
      const body = ((await res?.json().catch(() => ({}))) ?? {});
      const err = body.error;
      const message =
        typeof err === "string"
          ? err
          : (err?.formErrors?.[0] ??
            Object.values(err?.fieldErrors ?? {}).flat()[0] ??
            tAuth("genericError"));
      setError(message as string);
      return;
    }

    trackMetaEvent("CompleteRegistration");
    const body = await res.json().catch(() => ({}));
    if (body?.signedIn) {
      // No confirmation step (local development): straight to the start.
      router.replace("/welcome");
      router.refresh();
      return;
    }
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <AuthCard>
        <EmailCodeForm email={email} />
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <h1 className="font-display text-2xl font-semibold mb-1">{t("title")}</h1>
      <p className="text-muted text-sm mb-6">{t("subheadCategory")}</p>

      <GoogleAuthButton />
      <WhatsAppAuth mode="signup" />

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

        <label className="flex items-start gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 accent-primary"
          />
          {tAuth.rich("termsLabel", {
            terms: (chunks) => (
              <Link href="/terms" target="_blank" className={ui.link}>
                {chunks}
              </Link>
            ),
          })}
        </label>

        {error && (
          <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>
        )}

        <button type="submit" disabled={submitting} className={ui.buttonPrimary + " w-full"}>
          {submitting ? t("submitting") : t("submit")}
        </button>
      </form>

      <p className="text-xs text-muted mt-5 text-center">
        {t("hasAccount")}{" "}
        <Link href="/login" className={ui.link}>
          {t("logIn")}
        </Link>
      </p>
    </AuthCard>
  );
}
