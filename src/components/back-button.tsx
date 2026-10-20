"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";

/**
 * Goes back to wherever the person came from. The iPhone app has no
 * browser back button, so pages reached from a list need their own.
 * Opened straight from a shared link, there's nothing to go back to,
 * so it goes to `fallback` instead.
 */
export default function BackButton({ fallback, className = "" }: { fallback: string; className?: string }) {
  const t = useTranslations("ProfilePage");
  const router = useRouter();

  function goBack() {
    if (window.history.length > 1) router.back();
    else router.push(fallback);
  }

  return (
    <button
      type="button"
      onClick={goBack}
      className={"inline-flex items-center gap-1 -ms-1 text-sm font-medium text-ink/70 hover:text-ink " + className}
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5 rtl:scale-x-[-1]" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
        <path d="M15 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {t("back")}
    </button>
  );
}
