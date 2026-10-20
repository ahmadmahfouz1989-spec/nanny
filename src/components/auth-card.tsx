"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import BrandMark from "./brand-mark";
import LocaleSwitcher from "./locale-switcher";
import ThemeSwitcher from "./theme-switcher";
import ReadingIllustration from "./illustrations/reading-illustration";
import { ui } from "@/lib/ui";
import { isNativeApp } from "@/lib/native-app";

const noSubscription = () => () => {};

export default function AuthCard({ children }: { children: React.ReactNode }) {
  const t = useTranslations("Nav");
  // In the app there's no marketing home page to go back to (it sends you
  // straight here), so the link only shows in a browser.
  const inApp = useSyncExternalStore(noSubscription, isNativeApp, () => false);

  return (
    <main className="relative flex-1 flex items-center justify-center px-6 pb-16 pt-[calc(4rem+env(safe-area-inset-top))]">
      {!inApp && (
        <div className="absolute top-[calc(1.5rem+env(safe-area-inset-top))] start-6">
          <Link href="/" className={ui.link + " text-sm"}>
            {t("backToHome")}
          </Link>
        </div>
      )}

      <div className="absolute top-[calc(1.5rem+env(safe-area-inset-top))] end-6 flex items-center gap-3">
        <ThemeSwitcher />
        <LocaleSwitcher />
      </div>

      <div className="relative w-full max-w-sm">
        <div className="flex flex-col items-center gap-3 mb-6">
          <BrandMark />
          <ReadingIllustration className="w-28" />
        </div>
        <div className="oui-in rounded-2xl border border-border bg-surface shadow-md p-8">
          {children}
        </div>
      </div>
    </main>
  );
}
