"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import AuthCard from "@/components/auth-card";
import { ui } from "@/lib/ui";

export default function ResetPasswordPage() {
  const t = useTranslations("ResetPassword");
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);

    if (error) {
      setError(error.message);
      return;
    }

    router.push("/dashboard");
  }

  return (
    <AuthCard>
      <h1 className="font-display text-2xl font-semibold mb-1">{t("title")}</h1>
      <p className="text-muted text-sm mb-6">{t("subhead")}</p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <input
          type="password"
          required
          minLength={8}
          placeholder={t("newPasswordPlaceholder")}
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
    </AuthCard>
  );
}
