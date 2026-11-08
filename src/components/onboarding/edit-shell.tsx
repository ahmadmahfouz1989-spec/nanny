"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ui } from "@/lib/ui";
import { APP_MAIN_ID } from "@/components/shell/mobile-chrome";

/** Sent by scrollToFirstError: show the step holding this element. */
export const REVEAL_EVENT = "oui-reveal";

/**
 * The profile form layout for every category, both creating and editing.
 * A form with several sections is shown one section at a time ("Step 2 of
 * 4", Back / Next), so a long form doesn't feel like one: each child of the
 * sections list that starts with a SectionHeading begins a step. Saving with
 * a mistake goes back to the step that has it. An edit can be saved from any
 * step. A form with one section is a single page, as before.
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
  progress,
  restored = false,
  children,
}: {
  /** Required answers filled in, for the bar and the "5 of 9" line. */
  progress?: { done: number; total: number };
  /** The answers came back from a draft kept on the phone. */
  restored?: boolean;
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
  const [scrolled, setScrolled] = useState(0);
  const sectionsRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  const [steps, setSteps] = useState(1);

  // Which step each child of the sections list belongs to.
  const groups = useCallback(() => {
    const children = [...(sectionsRef.current?.children ?? [])] as HTMLElement[];
    let index = -1;
    return children.map((el) => {
      if (el.querySelector(".oui-section-heading") || index < 0) index++;
      return { el, index };
    });
  }, []);

  // After every render (sections can come and go as answers change): show
  // only the current step's sections. The count only changes when sections
  // do, so setting it here settles after one more render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    if (!onSave) return;
    const all = groups();
    const count = all.length ? all[all.length - 1]!.index + 1 : 1;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (count !== steps) setSteps(count);
    const current = Math.min(step, count - 1);
    for (const { el, index } of all) el.hidden = count > 1 && index !== current;
  });

  // A mistake found on saving: open its step.
  useEffect(() => {
    function reveal(e: Event) {
      const target = (e as CustomEvent<Element>).detail;
      const found = groups().find(({ el }) => el.contains(target));
      if (found) setStep(found.index);
    }
    window.addEventListener(REVEAL_EVENT, reveal);
    return () => window.removeEventListener(REVEAL_EVENT, reveal);
  }, [groups]);

  function go(next: number) {
    setStep(next);
    // Each step starts at its top.
    requestAnimationFrame(() => {
      const scroller = document.getElementById(APP_MAIN_ID);
      if (scroller) scroller.scrollTo({ top: 0, behavior: "smooth" });
      else window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }
  const stepped = !!onSave && steps > 1;
  const last = !stepped || step >= steps - 1;
  const editing = !saveLabel;

  useEffect(() => {
    // Inside the app frame the page scrolls in <main>, not the window.
    const scroller = document.getElementById(APP_MAIN_ID);
    function onScroll() {
      const el = scroller ?? document.documentElement;
      const scrollable = el.scrollHeight - el.clientHeight;
      const top = scroller ? scroller.scrollTop : window.scrollY;
      setScrolled(scrollable > 0 ? Math.min(1, top / scrollable) : 1);
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
          style={{ transform: `scaleX(${stepped ? (step + 1) / steps : progress && progress.total ? progress.done / progress.total : scrolled})` }}
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
            {onSave ? <p className="mt-1 text-xs text-muted">{tw("requiredNote")}</p> : <div className="mb-4" />}
            {onSave && !stepped && progress && progress.total > 0 && (
              <div className="mt-3 flex items-center gap-3" aria-live="polite">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-sunken">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
                </div>
                <span className="shrink-0 text-xs font-medium text-muted">{tw("progress", { done: progress.done, total: progress.total })}</span>
              </div>
            )}
            {stepped && (
              <div className="mt-4 flex flex-col gap-2">
                <div className="flex gap-1.5" aria-hidden>
                  {Array.from({ length: steps }, (_, i) => (
                    <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-ink" : "bg-surface-sunken"}`} />
                  ))}
                </div>
                <span className="text-xs font-semibold text-ink" aria-live="polite">
                  {tw("stepOf", { step: step + 1, total: steps })}
                  {progress && progress.total > 0 && (
                    <span className="font-medium text-muted"> · {tw("progress", { done: progress.done, total: progress.total })}</span>
                  )}
                </span>
              </div>
            )}
            {restored && <p className="mt-3 rounded-lg bg-secondary-soft px-3 py-2 text-sm text-secondary">{tw("restored")}</p>}
            {onSave && <div className="mb-6" />}

            <div ref={sectionsRef} data-stepped={stepped ? "" : undefined} className="oui-form-sections flex flex-col gap-8">
              {children}
            </div>

            {error && (
              <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger mt-6">{error}</p>
            )}

            <div className="flex items-center justify-between gap-3 mt-8 pt-6 border-t border-border">
              {stepped && step > 0 ? (
                <button type="button" onClick={() => go(step - 1)} className={ui.buttonGhost + " px-0!"}>
                  <span aria-hidden className="inline-block rtl:-scale-x-100">←</span>&nbsp;{tw("back")}
                </button>
              ) : (
                <button type="button" onClick={onCancel} className={ui.buttonGhost + " px-0!"}>
                  {tw("cancel")}
                </button>
              )}
              <div className="flex items-center gap-2">
                {/* An edit can be saved from any step. */}
                {onSave && !last && editing && (
                  <button type="button" onClick={onSave} disabled={submitting} className={ui.buttonSecondary}>
                    {submitting ? tw("saving") : tw("saveChanges")}
                  </button>
                )}
                {onSave && !last && (
                  <button type="button" onClick={() => go(step + 1)} className={ui.buttonPrimary}>
                    {tw("next")}
                  </button>
                )}
                {onSave && last && (
                  <button type="button" onClick={onSave} disabled={submitting} className={ui.buttonPrimary}>
                    {submitting ? tw("saving") : (saveLabel ?? tw("saveChanges"))}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
