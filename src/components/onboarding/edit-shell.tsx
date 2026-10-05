"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import BrandMark from "@/components/brand-mark";
import LocaleSwitcher from "@/components/locale-switcher";
import ThemeSwitcher from "@/components/theme-switcher";
import { ui } from "@/lib/ui";

/**
 * The profile form layout for every category, both creating and editing:
 * every section on one page with a single Save/Cancel. Sections are
 * numbered automatically (see .oui-form-sections in globals.css) and a thin
 * bar along the top shows how far down the form you are.
 */
export default function EditShell({
  title,
  error,
  onCancel,
  onSave,
  onBack,
  backLabel,
  submitting,
  children,
}: {
  title: string;
  error?: string | null;
  onCancel: () => void;
  onSave: () => void;
  onBack?: () => void;
  backLabel?: string;
  submitting?: boolean;
  children: React.ReactNode;
}) {
  const tw = useTranslations("Wizard");
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    function onScroll() {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(scrollable > 0 ? Math.min(1, window.scrollY / scrollable) : 1);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <>
      <div aria-hidden className="fixed inset-x-0 top-0 z-50 h-1 bg-transparent">
        <div
          className="h-full origin-left bg-primary transition-transform duration-150 rtl:origin-right"
          style={{ transform: `scaleX(${progress})` }}
        />
      </div>
      <header className="flex items-center justify-between gap-3 px-4 py-6 sm:px-10">
        <div className="flex min-w-0 items-center gap-4 sm:gap-5">
          <BrandMark compact />
          {onBack && (
            <button type="button" onClick={onBack} className={ui.link + " whitespace-nowrap text-sm"}>
              {backLabel}
            </button>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3 sm:gap-4">
          <ThemeSwitcher />
          <LocaleSwitcher />
        </div>
      </header>

      <main className="flex-1 flex items-start justify-center px-6 pb-16">
        <div className="w-full max-w-lg">
          <div className={ui.card + " p-8"}>
            <h1 className="font-display text-2xl font-semibold">{title}</h1>
            <p className="mt-1 mb-6 text-xs text-muted">{tw("requiredNote")}</p>

            <div className="oui-form-sections flex flex-col gap-8">{children}</div>

            {error && (
              <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger mt-6">{error}</p>
            )}

            <div className="flex items-center justify-between mt-8 pt-6 border-t border-border">
              <button type="button" onClick={onCancel} className={ui.buttonGhost + " px-0!"}>
                {tw("cancel")}
              </button>
              <button type="button" onClick={onSave} disabled={submitting} className={ui.buttonPrimary}>
                {submitting ? tw("saving") : tw("saveChanges")}
              </button>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
