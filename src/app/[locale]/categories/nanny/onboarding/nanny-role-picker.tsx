"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import BrandMark from "@/components/brand-mark";
import LocaleSwitcher from "@/components/locale-switcher";
import ThemeSwitcher from "@/components/theme-switcher";
import { Link, useRouter } from "@/i18n/navigation";
import { ui } from "@/lib/ui";

export default function NannyRolePicker() {
  const t = useTranslations("NannyRolePicker");
  const router = useRouter();
  const [submitting, setSubmitting] = useState<"parent" | "nanny" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(role: "parent" | "nanny") {
    setSubmitting(role);
    setError(null);
    const res = await fetch("/api/account/claim-role", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });

    if (!res.ok) {
      setSubmitting(null);
      setError(t("errorGeneric"));
      return;
    }

    router.push("/onboarding");
    router.refresh();
  }

  return (
    <>
      <header className="flex items-center justify-between px-6 sm:px-10 py-6">
        <div className="flex items-center gap-5">
          <BrandMark />
          <Link href="/categories" className={ui.link + " text-sm"}>
            {t("backToCategories")}
          </Link>
        </div>
        <div className="flex items-center gap-4">
          <ThemeSwitcher />
          <LocaleSwitcher />
        </div>
      </header>
      <main className="flex-1 flex items-start justify-center px-6 pb-16">
        <div className="w-full max-w-lg">
          <div className={ui.card + " p-8"}>
            <h1 className="font-display text-2xl font-semibold mb-2">{t("title")}</h1>
            <p className="text-sm text-muted mb-6">{t("subtitle")}</p>
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={() => choose("parent")}
                disabled={submitting !== null}
                className={ui.cardHover + " p-5 text-start"}
              >
                <p className="font-display font-semibold mb-1">{t("roleParentTitle")}</p>
                <p className="text-sm text-muted">{t("roleParentDescription")}</p>
              </button>
              <button
                type="button"
                onClick={() => choose("nanny")}
                disabled={submitting !== null}
                className={ui.cardHover + " p-5 text-start"}
              >
                <p className="font-display font-semibold mb-1">{t("roleNannyTitle")}</p>
                <p className="text-sm text-muted">{t("roleNannyDescription")}</p>
              </button>
            </div>
            {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger mt-4">{error}</p>}
          </div>
        </div>
      </main>
    </>
  );
}
