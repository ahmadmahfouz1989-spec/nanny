"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import AuthCard from "@/components/auth-card";
import { ui } from "@/lib/ui";

export default function RecoverPage() {
  const t = useTranslations("Recover");
  const tAuth = useTranslations("Auth");
  const [identifier, setIdentifier] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const isEmail = identifier.includes("@");

    await fetch("/api/auth/recover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(isEmail ? { email: identifier } : { phone: identifier }),
    });

    setSubmitting(false);
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
          <h1 className="font-display text-2xl font-semibold mb-2">{tAuth("checkInboxTitle")}</h1>
          <p className="text-muted text-sm">
            {tAuth.rich("checkInboxBody", {
              identifier,
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
        <button type="submit" disabled={submitting} className={ui.buttonPrimary + " w-full"}>
          {submitting ? t("submitting") : t("submit")}
        </button>
      </form>
    </AuthCard>
  );
}
