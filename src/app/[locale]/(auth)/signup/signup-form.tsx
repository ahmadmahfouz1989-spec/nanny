"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import AuthCard from "@/components/auth-card";
import { EmailField, PasswordField } from "@/components/auth-fields";
import GoogleAuthButton from "@/components/google-auth-button";
import AppleAuthButton from "@/components/apple-auth-button";
import WhatsAppAuth from "@/components/whatsapp-auth";
import EmailCodeForm from "@/components/email-code-form";
import { useRouter } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { safeReturnPath } from "@/lib/return-path";
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
  // Where to go once signed up -- e.g. back to the profile a shared link
  // opened (/u/<id>), not the generic start.
  const next = safeReturnPath(useSearchParams().get("next"));

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exists, setExists] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setExists(false);

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
      if (body.code === "exists") {
        setExists(true);
        return;
      }
      if (body.code === "weak_password") {
        setError(tAuth("weakPassword"));
        return;
      }
      if (body.code === "failed") {
        setError(tAuth("genericError"));
        return;
      }
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

    const body = await res.json().catch(() => ({}));
    if (body?.signedIn) {
      // No confirmation step (local development): straight to the start.
      router.replace(next ?? "/welcome");
      router.refresh();
      return;
    }
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <AuthCard>
        <EmailCodeForm email={email} next={next ?? "/welcome"} />
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <h1 className="font-display text-2xl font-semibold mb-1">{t("title")}</h1>
      {/* From "Message <name>" on a shared profile: say why they're here. */}
      <p className="text-muted text-sm mb-6">{next?.includes("contact=1") ? t("subheadContact") : t("subheadCategory")}</p>

      <div className="flex flex-col gap-2">
        <AppleAuthButton next={next} />
        <GoogleAuthButton next={next} />
      </div>
      <WhatsAppAuth mode="signup" next={next} />

      <div className="flex items-center gap-3 my-5">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted">{tAuth("orDivider")}</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <EmailField value={email} onChange={setEmail} />

        <PasswordField value={password} onChange={setPassword} isNew />

        <label className="flex items-start gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
          />
          {/* One span: in the flex row the link and the full stop were
              separate items, with a gap before the "." */}
          <span>
            {tAuth.rich("termsLabel", {
              terms: (chunks) => (
                <Link href="/terms" target="_blank" className={ui.link}>
                  {chunks}
                </Link>
              ),
            })}
          </span>
        </label>

        {error && (
          <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>
        )}
        {exists && (
          <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {tAuth("accountExists")}{" "}
            <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"} className={ui.link}>
              {t("logIn")}
            </Link>
          </p>
        )}

        <button type="submit" disabled={submitting} className={ui.buttonPrimary + " w-full"}>
          {submitting ? t("submitting") : t("submit")}
        </button>
      </form>

      <p className="text-xs text-muted mt-5 text-center">
        {t("hasAccount")}{" "}
        <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"} className={ui.link}>
          {t("logIn")}
        </Link>
      </p>
    </AuthCard>
  );
}
