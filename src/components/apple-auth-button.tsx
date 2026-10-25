"use client";

import { useState, useSyncExternalStore } from "react";
import { useLocale, useTranslations } from "next-intl";
import { hasNativeAppleSignIn, nativeAppleSignIn } from "@/lib/native-app";

function AppleIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 814 1000" className={className} aria-hidden fill="currentColor">
      <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105.6-57-155.5-127C46.7 790.7 0 663 0 541.8c0-194.4 126.4-297.5 250.8-297.5 66.1 0 121.2 43.4 162.7 43.4 39.5 0 101.1-46 176.3-46 28.5 0 130.9 2.6 198.3 99.2zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z" />
    </svg>
  );
}

function randomNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

const noSubscription = () => () => {};

async function sha256Hex(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Sign in with Apple, in the iPhone app only: Apple requires it next to
 * Google sign-in there. Apple's own sheet, no browser -- the token goes to
 * /auth/apple. Renders nothing on the website, on Android and in app
 * builds from before the plugin.
 */
export default function AppleAuthButton({ next = null }: { next?: string | null }) {
  const t = useTranslations("Auth");
  const locale = useLocale();
  // Client-only: the server can't tell whether the app has the plugin.
  const available = useSyncExternalStore(noSubscription, hasNativeAppleSignIn, () => false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!available) return null;

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const nonce = randomNonce();
      const token = await nativeAppleSignIn(await sha256Hex(nonce));
      if (!token) {
        setLoading(false);
        return;
      }
      const res = await fetch("/auth/apple", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, nonce, next, locale }),
      });
      const data = res.ok ? await res.json() : null;
      if (!data?.redirect) throw new Error(`apple sign-in failed (${res.status})`);
      window.location.href = data.redirect;
    } catch {
      setLoading(false);
      setError(t("genericError"));
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        // Apple's black button. Not built on ui.buttonSecondary: its
        // bg-surface/text-ink win over bg-black/text-white in the CSS.
        className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-black px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-black/85 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
      >
        <AppleIcon className="h-4 w-4" />
        {t("continueWithApple")}
      </button>
      {error && <p className="text-xs text-danger text-center">{error}</p>}
    </div>
  );
}
