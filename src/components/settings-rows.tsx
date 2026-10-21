"use client";

import { useTranslations } from "next-intl";
import { useTheme } from "@/components/theme-switcher";
import LocaleSwitcher from "@/components/locale-switcher";
import SignOutButton from "@/components/sign-out-button";
import { ChevronIcon, GlobeIcon, LogoutIcon, MoonIcon } from "@/components/home-icons";

/** An on/off switch drawn like iOS's. */
function Switch({ on }: { on: boolean }) {
  return (
    <span aria-hidden className={`relative inline-flex h-7 w-12 shrink-0 rounded-full transition-colors ${on ? "bg-primary" : "bg-border-strong"}`}>
      <span
        className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-[inset-inline-start] ${on ? "start-[1.375rem]" : "start-0.5"}`}
      />
    </span>
  );
}

/**
 * Dark mode, language and log out as rows -- the bottom of the phone menu
 * and of Settings & Help.
 */
export default function SettingsRows({
  rowClassName = "flex w-full items-center gap-3 px-5 py-4 text-[15px] text-ink transition-colors hover:bg-surface-sunken",
  className = "divide-y divide-border",
}: {
  rowClassName?: string;
  className?: string;
}) {
  const t = useTranslations("Menu");
  const { theme, toggle } = useTheme();
  const chevron = <ChevronIcon className="h-5 w-5 shrink-0 text-muted" />;

  return (
    <div className={`flex flex-col ${className}`}>
      <button type="button" role="switch" aria-checked={theme === "dark"} onClick={toggle} className={rowClassName}>
        <MoonIcon className="h-[22px] w-[22px] text-muted" />
        <span className="flex-1 text-start">{t("darkMode")}</span>
        <Switch on={theme === "dark"} />
      </button>
      <LocaleSwitcher className={rowClassName}>
        {(label) => (
          <>
            <GlobeIcon className="h-[22px] w-[22px] text-muted" />
            <span className="flex-1 text-start">{t("language")}</span>
            <span className="text-sm text-muted">{label}</span>
            {chevron}
          </>
        )}
      </LocaleSwitcher>
      <SignOutButton className={rowClassName}>
        <LogoutIcon className="h-[22px] w-[22px] text-muted" />
        <span className="flex-1 text-start">{t("logout")}</span>
        {chevron}
      </SignOutButton>
    </div>
  );
}
