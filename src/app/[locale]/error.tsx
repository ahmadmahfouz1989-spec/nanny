"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ui } from "@/lib/ui";
import { AnimatedLogo } from "@/components/animated-logo";

/**
 * A page that failed to load (a dropped connection, a server hiccup):
 * says so in plain words with Try again -- which fetches the page again --
 * and a way home, instead of a blank screen.
 */
export default function PageError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const t = useTranslations("PageError");
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <AnimatedLogo size={48} />
      <h1 className="font-display text-xl font-bold text-ink">{t("title")}</h1>
      <p className="max-w-xs text-sm text-muted">{t("body")}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" onClick={() => retry()} className={ui.buttonPrimary}>
          {t("retry")}
        </button>
        <Link href="/" className={ui.buttonSecondary}>
          {t("home")}
        </Link>
      </div>
    </main>
  );
}
