"use client";

import { useTranslations } from "next-intl";
import BrandMark from "@/components/brand-mark";
import LocaleSwitcher from "@/components/locale-switcher";
import ThemeSwitcher from "@/components/theme-switcher";
import { ui } from "@/lib/ui";

/**
 * Editing an existing profile shouldn't mean re-walking the same
 * step-by-step wizard used to create it — this shows every section at
 * once with a single Save/Cancel, no Next/Next/Next. First-time
 * onboarding (no existing profile yet) still uses WizardShell.
 */
export default function EditShell({
  title,
  error,
  onCancel,
  onSave,
  submitting,
  children,
}: {
  title: string;
  error?: string | null;
  onCancel: () => void;
  onSave: () => void;
  submitting?: boolean;
  children: React.ReactNode;
}) {
  const tw = useTranslations("Wizard");

  return (
    <>
      <header className="flex items-center justify-between px-6 sm:px-10 py-6">
        <BrandMark />
        <div className="flex items-center gap-4">
          <ThemeSwitcher />
          <LocaleSwitcher />
        </div>
      </header>

      <main className="flex-1 flex items-start justify-center px-6 pb-16">
        <div className="w-full max-w-lg">
          <div className={ui.card + " p-8"}>
            <h1 className="font-display text-2xl font-semibold mb-6">{title}</h1>

            <div className="flex flex-col gap-8">{children}</div>

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
