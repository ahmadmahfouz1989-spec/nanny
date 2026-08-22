"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import BrandMark from "@/components/brand-mark";
import LocaleSwitcher from "@/components/locale-switcher";
import ThemeSwitcher from "@/components/theme-switcher";

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations("Admin");
  const pathname = usePathname();

  const tabs = [
    { href: "/admin", label: t("navOverview") },
    { href: "/admin/profiles", label: t("navProfiles") },
    { href: "/admin/users", label: t("navUsers") },
    { href: "/admin/reports", label: t("navReports") },
  ];

  return (
    <>
      <header className="flex items-center justify-between px-6 sm:px-10 py-6">
        <BrandMark />
        <div className="flex items-center gap-3">
          <ThemeSwitcher />
          <LocaleSwitcher />
        </div>
      </header>

      <div className="px-6 sm:px-10">
        <nav className="flex gap-1 border-b border-border max-w-3xl mx-auto">
          {tabs.map((tab) => {
            const active = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  active ? "border-primary text-ink" : "border-transparent text-muted hover:text-ink"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-10">{children}</main>
    </>
  );
}
