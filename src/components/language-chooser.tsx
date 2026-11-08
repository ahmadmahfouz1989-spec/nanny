"use client";

import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import BrandMark from "@/components/brand-mark";
import { LANGUAGE_CHOSEN_COOKIE } from "@/lib/language-ask";

/**
 * The first time someone opens the app or the website: "English or
 * العربية?", before anything else -- their profile and every screen after
 * are in the language they pick. Both labels are in their own language, so
 * either reader understands the question. Hidden unless the head script
 * marked the page (see .lang-ask in globals.css).
 */
export default function LanguageChooser() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  function choose(next: "en" | "ar") {
    document.cookie = `${LANGUAGE_CHOSEN_COOKIE}=1; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    document.documentElement.removeAttribute("data-lang-ask");
    if (next !== locale) {
      const query = Object.fromEntries(new URLSearchParams(window.location.search).entries());
      router.replace({ pathname, query }, { locale: next });
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="lang-ask-title" className="lang-ask fixed inset-0 z-[100] flex-col items-center justify-center gap-8 bg-background px-6 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
      <BrandMark />
      <div className="flex flex-col items-center gap-1 text-center">
        <p id="lang-ask-title" className="font-display text-2xl font-bold text-ink">
          Choose your language
        </p>
        <p lang="ar" dir="rtl" className="font-display text-2xl font-bold text-ink">
          اختار لغتك
        </p>
      </div>
      <div className="flex w-full max-w-xs flex-col gap-3">
        <button type="button" lang="en" onClick={() => choose("en")} className="rounded-2xl border border-border-strong bg-surface px-5 py-4 text-lg font-semibold text-ink transition hover:border-ink active:scale-[0.98]">
          English
        </button>
        <button type="button" lang="ar" dir="rtl" onClick={() => choose("ar")} className="rounded-2xl border border-border-strong bg-surface px-5 py-4 text-lg font-semibold text-ink transition hover:border-ink active:scale-[0.98]">
          العربية
        </button>
      </div>
      <p className="text-center text-xs text-muted">
        You can change it later in Settings · <span lang="ar" dir="rtl">فيك تغيّرها بعدين من الإعدادات</span>
      </p>
    </div>
  );
}
