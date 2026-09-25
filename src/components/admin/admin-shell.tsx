"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import BrandMark from "@/components/brand-mark";
import LocaleSwitcher from "@/components/locale-switcher";
import ThemeSwitcher from "@/components/theme-switcher";
import SignOutButton from "@/components/sign-out-button";
import NotificationBell from "@/components/notification-bell";
import { AdminIcon, FeedIcon, FlagIcon, GridIcon, UsersIcon } from "@/components/nav-icons";
import { ToastProvider } from "@/components/toast-provider";

type NavItem = {
  href: string;
  label: string;
  Icon: (props: { className?: string }) => React.ReactElement;
  // Work waiting in this section, shown as a badge -- only for queues.
  count?: number;
};

// Overview is the section root, so it's only active on an exact match;
// every other section also owns its sub-paths.
function isActive(pathname: string, href: string) {
  return href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The admin area's own frame -- deliberately not the marketplace AppShell:
 * an admin has no categories, matches or messages, so none of that
 * navigation appears here (the middleware keeps admins out of those pages
 * entirely). Sidebar on desktop, a scrolling tab row on mobile, and the
 * pending-review / open-report counts on the two queues so the work
 * waiting is visible from anywhere in the panel.
 */
export default function AdminShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations("Admin");
  const pathname = usePathname();
  const [counts, setCounts] = useState<{ pending: number; reports: number } | null>(null);

  // Re-read on navigation, so a queue badge drops as soon as an admin has
  // worked through it and moved on.
  useEffect(() => {
    let active = true;
    fetch("/api/admin/analytics")
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (active && body) setCounts({ pending: body.pendingProfiles ?? 0, reports: body.openReports ?? 0 });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [pathname]);

  const items: NavItem[] = [
    { href: "/admin", label: t("navOverview"), Icon: GridIcon },
    { href: "/admin/profiles", label: t("navProfiles"), Icon: AdminIcon, count: counts?.pending },
    { href: "/admin/reports", label: t("navReports"), Icon: FlagIcon, count: counts?.reports },
    { href: "/admin/users", label: t("navUsers"), Icon: UsersIcon },
    { href: "/admin/feed", label: t("navFeed"), Icon: FeedIcon },
  ];

  const badge = (count: number | undefined) =>
    count ? (
      <span className="ms-auto rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-white tabular-nums">
        {count > 99 ? "99+" : count}
      </span>
    ) : null;

  return (
    <ToastProvider>
      <div className="flex min-h-screen">
        <aside className="hidden sm:flex sm:flex-col sm:w-60 shrink-0 border-e border-border px-3 py-5 sticky top-0 h-screen">
          <div className="px-3 mb-6 flex items-center gap-2">
            <BrandMark />
            <span className="rounded-md bg-ink px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-background">
              {t("adminBadge")}
            </span>
          </div>

          <nav className="flex flex-col gap-0.5" aria-label={t("adminBadge")}>
            {items.map(({ href, label, Icon, count }) => {
              const active = isActive(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2 text-[15px] transition-colors ${
                    active ? "bg-surface-sunken font-semibold text-ink" : "text-muted hover:bg-surface-sunken hover:text-ink"
                  }`}
                >
                  <Icon className="h-[22px] w-[22px] shrink-0" />
                  <span>{label}</span>
                  {badge(count)}
                </Link>
              );
            })}
            <NotificationBell variant="sidebar" />
          </nav>

          <div className="mt-auto flex flex-col gap-3 px-3 pt-4">
            <div className="flex items-center gap-3">
              <ThemeSwitcher />
              <LocaleSwitcher />
            </div>
            <SignOutButton />
          </div>
        </aside>

        <div className="flex-1 min-w-0 flex flex-col">
          <header className="sm:hidden sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2">
                <BrandMark />
                <span className="rounded-md bg-ink px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-background">
                  {t("adminBadge")}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <NotificationBell variant="header" />
                <ThemeSwitcher />
                <LocaleSwitcher className="px-2" />
                <SignOutButton />
              </div>
            </div>
            <nav className="flex gap-1 overflow-x-auto px-3 pb-2" aria-label={t("adminBadge")}>
              {items.map(({ href, label, count }) => {
                const active = isActive(pathname, href);
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors ${
                      active ? "bg-surface-sunken font-semibold text-ink" : "text-muted"
                    }`}
                  >
                    {label}
                    {count ? (
                      <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold text-white tabular-nums">
                        {count > 99 ? "99+" : count}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </nav>
          </header>

          <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-10 py-8">
            <div className="oui-in">{children}</div>
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
