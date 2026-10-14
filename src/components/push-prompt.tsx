"use client";

import { useState, useSyncExternalStore } from "react";
import { useLocale, useTranslations } from "next-intl";
import { enablePush, pushSupport } from "@/lib/push-client";

const DISMISSED_KEY = "push-prompt-dismissed-at";
// "Not now" is a snooze, not a refusal -- ask again after a week.
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function wasSnoozed() {
  try {
    const at = Number(localStorage.getItem(DISMISSED_KEY));
    return at > 0 && Date.now() - at < SNOOZE_MS;
  } catch {
    return false; // storage unavailable -- show the prompt anyway
  }
}

const noopSubscribe = () => () => {};

/**
 * Banner above the tab bar asking the installed (home-screen) app to turn
 * on push. iOS only shows the system permission dialog from a tap, so this
 * is the step before it. Only while the permission is still undecided:
 * once allowed or blocked, the Profile card is the place to change it.
 */
export default function PushPrompt() {
  const t = useTranslations("Push");
  const locale = useLocale();
  const eligible = useSyncExternalStore(
    noopSubscribe,
    () => pushSupport() === "supported" && isStandalone() && Notification.permission === "default" && !wasSnoozed(),
    () => false,
  );
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);

  function dismiss() {
    setHidden(true);
    try {
      localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    } catch {
      // ignore — storage may be unavailable
    }
  }

  async function allow() {
    setBusy(true);
    try {
      const permission = await enablePush(locale);
      // Closing the system dialog without choosing leaves it "default".
      if (permission === "default") dismiss();
      else setHidden(true);
    } catch {
      dismiss();
    }
  }

  if (!eligible || hidden) return null;

  return (
    <div className="fixed inset-x-3 z-30 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] flex items-center gap-3 rounded-2xl border border-border bg-surface-raised p-3 shadow-lg sm:inset-x-auto sm:end-6 sm:bottom-6 sm:w-96">
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">{t("promptTitle")}</p>
        <p className="text-xs text-muted">{t("promptBody")}</p>
      </div>
      <button
        type="button"
        onClick={allow}
        disabled={busy}
        className="shrink-0 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-50"
      >
        {t("allow")}
      </button>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t("dismiss")}
        className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-full text-muted hover:text-ink"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
