"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useRouter, Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import AuthCard from "@/components/auth-card";
import { ui } from "@/lib/ui";

export default function LoginForm() {
  const t = useTranslations("Login");
  const tAuth = useTranslations("Auth");
  const router = useRouter();
  const locale = useLocale();
  const searchParams = useSearchParams();
  // middleware sets `next` to a locale-prefixed pathname (e.g. /en/admin) —
  // strip the prefix since the locale-aware router re-adds it on push.
  const rawNext = searchParams.get("next");
  const explicitNext = rawNext
    ? rawNext.replace(new RegExp(`^/${locale}(?=/|$)`), "") || "/"
    : null;

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    searchParams.get("error") === "account_suspended" ? t("accountSuspended") : null,
  );
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const supabase = createClient();
    const isEmail = identifier.includes("@");

    const { error } = await supabase.auth.signInWithPassword(
      isEmail ? { email: identifier, password } : { phone: identifier, password },
    );

    if (error) {
      setSubmitting(false);
      setError(t("invalidCredentials"));
      return;
    }

    const meRes = await fetch("/api/auth/me");
    const me = await meRes.json().catch(() => null);
    setSubmitting(false);

    if (me?.user?.status === "suspended") {
      await supabase.auth.signOut();
      setError(t("accountSuspended"));
      return;
    }

    const target =
      explicitNext ?? (me?.profile?.moderation_status === "approved" ? "/matches" : "/dashboard");

    router.push(target);
    router.refresh();
  }

  return (
    <AuthCard>
      <h1 className="font-display text-2xl font-semibold mb-1">{t("title")}</h1>
      <p className="text-muted text-sm mb-6">{t("subhead")}</p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <input
          type="text"
          required
          placeholder={tAuth("identifierPlaceholder")}
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
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
          <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>
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
