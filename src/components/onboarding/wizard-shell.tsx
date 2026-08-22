"use client";

import { useTranslations } from "next-intl";
import BrandMark from "@/components/brand-mark";
import LocaleSwitcher from "@/components/locale-switcher";
import ThemeSwitcher from "@/components/theme-switcher";
import { ui } from "@/lib/ui";

export default function WizardShell({
  step,
  totalSteps,
  title,
  error,
  onBack,
  onNext,
  nextLabel,
  nextDisabled,
  submitting,
  children,
}: {
  step: number;
  totalSteps: number;
  title: string;
  error?: string | null;
  onBack: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  submitting?: boolean;
  children: React.ReactNode;
}) {
  const t = useTranslations("Wizard");

  return (
    <>
      <header className="flex items-center justify-between px-6 sm:px-10 py-6">
        <BrandMark />
        <div className="flex items-center gap-4">
          <ThemeSwitcher />
          <LocaleSwitcher />
          <span className="text-xs font-medium text-muted">{t("step", { step, total: totalSteps })}</span>
        </div>
      </header>

      <main className="flex-1 flex items-start justify-center px-6 pb-16">
        <div className="w-full max-w-lg">
          <div className="flex gap-1.5 mb-8">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  i < step ? "bg-primary" : "bg-border"
                }`}
              />
            ))}
          </div>

          <div className={ui.card + " p-8"}>
            <h1 className="font-display text-2xl font-semibold mb-6">{title}</h1>

            <div className="flex flex-col gap-4">{children}</div>

            {error && (
              <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger mt-4">{error}</p>
            )}

            <div className="flex items-center justify-between mt-8">
              <button type="button" onClick={onBack} className={ui.buttonGhost + " px-0!"} disabled={step === 1}>
                {t("back")}
              </button>
              <button
                type="button"
                onClick={onNext}
                disabled={nextDisabled || submitting}
                className={ui.buttonPrimary}
              >
                {submitting ? t("saving") : (nextLabel ?? t("next"))}
              </button>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
