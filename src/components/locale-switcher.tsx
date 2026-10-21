"use client";

import type { ReactNode } from "react";
import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";

export default function LocaleSwitcher({
  className = "",
  children,
}: {
  className?: string;
  // Custom content around the other language's name (e.g. a menu row).
  children?: (label: string) => ReactNode;
}) {
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
      className={children ? className : `text-sm font-medium text-muted hover:text-ink transition ${className}`}
    >
      {children ? children(other === "ar" ? "العربية" : "English") : other === "ar" ? "العربية" : "English"}
    </button>
  );
}
