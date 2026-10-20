"use client";

import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";

// How long the browser's history was when the app first loaded. Anything
// past it is a page you came from inside the app; at or below it, "back"
// would leave the app (a shared link) or do nothing (the iPhone app).
const START = typeof window === "undefined" ? 0 : window.history.length;

/** Where back goes when there's no page behind this one in the app. */
function fallbackFor(pathname: string) {
  return pathname.startsWith("/categories") || pathname.startsWith("/featured") ? "/profile" : "/feed";
}

/** Goes back to wherever the person came from, or up to a sensible page. */
export function useGoBack(fallback?: string) {
  const router = useRouter();
  const pathname = usePathname();
  return () => {
    if (window.history.length > START) router.back();
    else router.replace(fallback ?? fallbackFor(pathname));
  };
}

export function BackArrow({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className + " rtl:scale-x-[-1]"} fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path d="M15 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * A back link inside a page, for the computer layout. On the phone the top
 * bar has the back arrow (see MobileHeader), so this one hides there.
 */
export default function BackButton({ fallback, className = "" }: { fallback?: string; className?: string }) {
  const t = useTranslations("Nav");
  const goBack = useGoBack(fallback);

  return (
    <button
      type="button"
      onClick={goBack}
      className={"hidden sm:inline-flex items-center gap-1 -ms-1 text-sm font-medium text-ink/70 hover:text-ink " + className}
    >
      <BackArrow />
      {t("back")}
    </button>
  );
}
