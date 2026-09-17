"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { ui } from "@/lib/ui";

function GoogleIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden>
      <path
        fill="#4285F4"
        d="M19.6 10.23c0-.68-.06-1.32-.17-1.94H10v3.67h5.38a4.6 4.6 0 0 1-2 3.02v2.5h3.24c1.9-1.75 2.98-4.32 2.98-7.25Z"
      />
      <path
        fill="#34A853"
        d="M10 20c2.7 0 4.96-.9 6.62-2.42l-3.24-2.5c-.9.6-2.05.96-3.38.96-2.6 0-4.8-1.75-5.59-4.11H1.06v2.59A10 10 0 0 0 10 20Z"
      />
      <path fill="#FBBC05" d="M4.41 11.93A6 6 0 0 1 4.09 10c0-.67.11-1.32.32-1.93V5.48H1.06A10 10 0 0 0 0 10c0 1.61.39 3.14 1.06 4.52l3.35-2.59Z" />
      <path
        fill="#EA4335"
        d="M10 3.96c1.47 0 2.79.5 3.83 1.5l2.87-2.87C14.95.99 12.7 0 10 0 6.09 0 2.72 2.24 1.06 5.48l3.35 2.59C5.2 5.71 7.4 3.96 10 3.96Z"
      />
    </svg>
  );
}

/**
 * Same button/behavior for both /login and /signup -- with OAuth these are
 * really one action (Supabase creates the account on first use), and
 * Supabase Auth automatically links this identity to an existing
 * email/password account of the same (verified) email, so there's no
 * separate "merge accounts" step to build here.
 */
export default function GoogleAuthButton() {
  const t = useTranslations("Auth");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });

    // On success this navigates away to Google -- there's nothing further
    // to do here. An error means the redirect never happened.
    if (error) {
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
        className={ui.buttonSecondary + " w-full gap-2"}
      >
        <GoogleIcon className="h-4 w-4" />
        {t("continueWithGoogle")}
      </button>
      {error && <p className="text-xs text-danger text-center">{error}</p>}
    </div>
  );
}
