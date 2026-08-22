"use client";

import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";

export default function LocaleSwitcher({ className = "" }: { className?: string }) {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const other = locale === "ar" ? "en" : "ar";

  function handleSwitch() {
    const query = Object.fromEntries(new URLSearchParams(window.location.search).entries());
    router.replace({ pathname, query }, { locale: other });
  }

  return (
    <button
      type="button"
      onClick={handleSwitch}
      className={`text-sm font-medium text-muted hover:text-ink transition ${className}`}
    >
      {other === "ar" ? "العربية" : "English"}
    </button>
  );
}
