"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";

const DISMISSED_KEY = "install-prompt-dismissed";

// Chrome/Edge/Samsung fire this instead of showing their own install UI.
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIosSafari() {
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
  // In-app browsers and Chrome/Firefox on iOS can't add to the home screen
  // the same way; only nudge real Safari.
  return ios && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|Instagram|FBAN|FBAV/.test(ua);
}

function wasDismissed() {
  try {
    return localStorage.getItem(DISMISSED_KEY) !== null;
  } catch {
    return false; // storage unavailable -- show the prompt anyway
  }
}

const noopSubscribe = () => () => {};

/**
 * Phone-only banner above the tab bar inviting people to install the app.
 * Android gets a real Install button; iOS (no install API) gets the
 * Share → Add to Home Screen hint. Dismissal is remembered per device.
 */
export default function InstallPrompt() {
  const t = useTranslations("Install");
  const iosEligible = useSyncExternalStore(
    noopSubscribe,
    () => isIosSafari() && !isStandalone() && !wasDismissed(),
    () => false,
  );
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    function onBeforeInstall(e: Event) {
      e.preventDefault();
      if (isStandalone() || wasDismissed()) return;
      setDeferred(e as BeforeInstallPromptEvent);
    }
    function onInstalled() {
      setHidden(true);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  function dismiss() {
    setHidden(true);
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // ignore — storage may be unavailable
    }
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    if (outcome === "accepted") setHidden(true);
    else dismiss();
  }

  const mode = hidden ? null : iosEligible ? "ios" : deferred ? "android" : null;
  if (!mode) return null;

  return (
    <div className="sm:hidden fixed inset-x-3 z-30 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] flex items-center gap-3 rounded-2xl border border-border bg-surface-raised p-3 shadow-lg">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/icon-192.png" alt="" className="h-10 w-10 shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">{t("title")}</p>
        <p className="text-xs text-muted">{mode === "ios" ? t("iosHint") : t("body")}</p>
      </div>
      {mode === "android" && (
        <button
          type="button"
          onClick={install}
          className="shrink-0 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover"
        >
          {t("install")}
        </button>
      )}
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
