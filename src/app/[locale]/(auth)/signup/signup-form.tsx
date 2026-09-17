"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link } from "@/i18n/navigation";
import AuthCard from "@/components/auth-card";
import { ui } from "@/lib/ui";

// No category chooses a role at signup anymore -- see signupSchema in
// src/lib/validation/auth.ts. Role (parent/nanny for the nanny category,
// seeker/provider for nursing) is picked after signing in, inside that
// category's own onboarding. `category`+`role` here are only a hint,
// carried through email confirmation (as `next`) to land the visitor
// straight on the right onboarding screen instead of the categories hub.
const SUPPORTED_CATEGORIES = new Set(["nanny", "nursing"]);

export default function SignupForm() {
  const t = useTranslations("Signup");
  const tAuth = useTranslations("Auth");
  const searchParams = useSearchParams();
  const categoryParam = searchParams.get("category");
  const category = categoryParam && SUPPORTED_CATEGORIES.has(categoryParam) ? categoryParam : null;
  const categoryRole = searchParams.get("role");

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

    const next = category
      ? `/categories/${category}/onboarding${categoryRole ? `?role=${categoryRole}` : ""}`
      : undefined;

    setSubmitting(true);
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, next }),
    });
    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
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

    setSubmitted(true);
  }

  if (submitted) {
    return (
      <AuthCard>
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-secondary-soft text-secondary">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path
                d="M4 6h16v12H4V6Zm0 0 8 7 8-7"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h1 className="font-display text-2xl font-semibold mb-2">{tAuth("checkEmailTitle")}</h1>
          <p className="text-muted text-sm">
            {tAuth.rich("checkEmailBody", {
              email,
              mark: (chunks) => <span className="text-ink">{chunks}</span>,
            })}
          </p>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <h1 className="font-display text-2xl font-semibold mb-1">{t("title")}</h1>
      <p className="text-muted text-sm mb-6">{t("subheadCategory")}</p>

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
