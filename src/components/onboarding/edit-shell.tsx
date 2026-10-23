"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ui } from "@/lib/ui";
import { APP_MAIN_ID } from "@/components/shell/mobile-chrome";

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
  saveLabel,
  children,
}: {
  /** The button's words for something new ("Send my request"); edits keep "Save changes". */
  saveLabel?: string;
  title: string;
  error?: string | null;
  onCancel: () => void;
  /** Left out on a screen with nothing to save yet (choosing what the form is for). */
  onSave?: () => void;
  onBack?: () => void;
  backLabel?: string;
  submitting?: boolean;
  children: React.ReactNode;
}) {
  const tw = useTranslations("Wizard");
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // Inside the app frame the page scrolls in <main>, not the window.
    const scroller = document.getElementById(APP_MAIN_ID);
    function onScroll() {
      const el = scroller ?? document.documentElement;
      const scrollable = el.scrollHeight - el.clientHeight;
      const top = scroller ? scroller.scrollTop : window.scrollY;
      setProgress(scrollable > 0 ? Math.min(1, top / scrollable) : 1);
    }
    onScroll();
    const target: HTMLElement | Window = scroller ?? window;
    target.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      target.removeEventListener("scroll", onScroll);
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
      <div className="flex items-start justify-center px-4 py-6 pb-16 sm:px-6 sm:py-8">
        <div className="w-full max-w-lg">
          {/* The app's top bar has the back arrow; this goes back one step
              inside the form instead (to choosing seeker or provider). */}
          {onBack && (
            <button type="button" onClick={onBack} className={ui.link + " mb-3 text-sm"}>
              {backLabel}
            </button>
          )}
          <div className={ui.card + " p-6 sm:p-8"}>
            <h1 className="font-display text-2xl font-semibold">{title}</h1>
            {onSave ? <p className="mt-1 mb-6 text-xs text-muted">{tw("requiredNote")}</p> : <div className="mb-4" />}

            <div className="oui-form-sections flex flex-col gap-8">{children}</div>

            {error && (
              <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger mt-6">{error}</p>
            )}

            <div className="flex items-center justify-between mt-8 pt-6 border-t border-border">
              <button type="button" onClick={onCancel} className={ui.buttonGhost + " px-0!"}>
                {tw("cancel")}
              </button>
              {onSave && (
                <button type="button" onClick={onSave} disabled={submitting} className={ui.buttonPrimary}>
                  {submitting ? tw("saving") : (saveLabel ?? tw("saveChanges"))}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
