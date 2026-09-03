import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import BrandMark from "@/components/brand-mark";
import ThemeSwitcher from "@/components/theme-switcher";
import LocaleSwitcher from "@/components/locale-switcher";
import SignOutButton from "@/components/sign-out-button";
import NotificationBell from "@/components/notification-bell";
import { MessagesSidebarItem, MessagesTabItem } from "@/components/matches/messages-nav-item";
import { HomeIcon, ProfileIcon, GridIcon } from "@/components/nav-icons";

type ActiveKey = "home" | "categories" | "messages" | "profile";

export default async function AppShell({
  active,
  children,
}: {
  active: ActiveKey;
  children: React.ReactNode;
}) {
  const t = await getTranslations("Nav");

  return (
    <div className="flex min-h-screen">
      <aside className="hidden sm:flex sm:flex-col sm:w-60 shrink-0 border-e border-border px-3 py-5">
        <div className="px-3 mb-5">
          <BrandMark />
        </div>

        <nav className="flex flex-col gap-0.5">
          <Link
            href="/dashboard"
            className={`flex items-center gap-3 rounded-xl px-3 py-2 text-[15px] transition-colors ${
              active === "home"
                ? "bg-surface-sunken font-semibold text-ink"
                : "text-muted hover:bg-surface-sunken hover:text-ink"
            }`}
          >
            <HomeIcon className="h-[22px] w-[22px] shrink-0" />
            <span>{t("home")}</span>
          </Link>
          <Link
            href="/categories"
            className={`flex items-center gap-3 rounded-xl px-3 py-2 text-[15px] transition-colors ${
              active === "categories"
                ? "bg-surface-sunken font-semibold text-ink"
                : "text-muted hover:bg-surface-sunken hover:text-ink"
            }`}
          >
            <GridIcon className="h-[22px] w-[22px] shrink-0" />
            <span>{t("categories")}</span>
          </Link>
          <MessagesSidebarItem active={active === "messages"} />
          <NotificationBell variant="sidebar" />
          <Link
            href="/profile"
            className={`flex items-center gap-3 rounded-xl px-3 py-2 text-[15px] transition-colors ${
              active === "profile"
                ? "bg-surface-sunken font-semibold text-ink"
                : "text-muted hover:bg-surface-sunken hover:text-ink"
            }`}
          >
            <ProfileIcon className="h-[22px] w-[22px] shrink-0" />
            <span>{t("profile")}</span>
          </Link>
        </nav>

        <div className="mt-auto flex flex-col gap-3 px-3 pt-4">
          <div className="flex items-center gap-3">
            <ThemeSwitcher />
            <LocaleSwitcher />
          </div>
          <SignOutButton />
        </div>
      </aside>

      <header className="sm:hidden fixed top-0 inset-x-0 z-30 flex items-center justify-between px-4 py-3 border-b border-border bg-background/90 backdrop-blur">
        <BrandMark />
        <div className="flex items-center gap-1">
          <NotificationBell variant="header" />
          <ThemeSwitcher />
          <LocaleSwitcher className="px-2" />
          <SignOutButton />
        </div>
      </header>

      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-30 flex items-center justify-around border-t border-border bg-background/90 backdrop-blur py-1.5">
        <Link
          href="/dashboard"
          className={`flex flex-col items-center gap-0.5 px-3 py-1 text-[11px] transition-colors ${
            active === "home" ? "font-semibold text-primary" : "text-muted"
          }`}
        >
          <HomeIcon className="h-[22px] w-[22px]" />
          {t("home")}
        </Link>
        <Link
          href="/categories"
          className={`flex flex-col items-center gap-0.5 px-3 py-1 text-[11px] transition-colors ${
            active === "categories" ? "font-semibold text-primary" : "text-muted"
          }`}
        >
          <GridIcon className="h-[22px] w-[22px]" />
          {t("categories")}
        </Link>
        <MessagesTabItem active={active === "messages"} />
        <Link
          href="/profile"
          className={`flex flex-col items-center gap-0.5 px-3 py-1 text-[11px] transition-colors ${
            active === "profile" ? "font-semibold text-primary" : "text-muted"
          }`}
        >
          <ProfileIcon className="h-[22px] w-[22px]" />
          {t("profile")}
        </Link>
      </nav>

      <main className="flex-1 min-w-0 h-screen overflow-y-auto pt-16 pb-20 sm:pt-0 sm:pb-0">{children}</main>
    </div>
  );
}
