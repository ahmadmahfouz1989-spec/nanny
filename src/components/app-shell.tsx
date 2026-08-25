import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import BrandMark from "@/components/brand-mark";
import ThemeSwitcher from "@/components/theme-switcher";
import LocaleSwitcher from "@/components/locale-switcher";
import SignOutButton from "@/components/sign-out-button";
import { MessagesSidebarItem, MessagesTabItem } from "@/components/matches/messages-nav-item";
import { HomeIcon, ProfileIcon } from "@/components/nav-icons";

type ActiveKey = "home" | "messages" | "profile";

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
      <aside className="hidden sm:flex sm:flex-col sm:w-64 shrink-0 border-e border-border px-3 py-6">
        <div className="px-3 mb-6">
          <BrandMark />
        </div>

        <nav className="flex flex-col gap-1">
          <Link
            href="/dashboard"
            className={`flex items-center gap-3 rounded-full px-3 py-2.5 text-[15px] transition-colors ${
              active === "home" ? "font-bold text-ink" : "text-ink/80 hover:bg-surface"
            }`}
          >
            <HomeIcon className="h-6 w-6 shrink-0" />
            <span>{t("home")}</span>
          </Link>
          <MessagesSidebarItem active={active === "messages"} />
          <Link
            href="/profile"
            className={`flex items-center gap-3 rounded-full px-3 py-2.5 text-[15px] transition-colors ${
              active === "profile" ? "font-bold text-ink" : "text-ink/80 hover:bg-surface"
            }`}
          >
            <ProfileIcon className="h-6 w-6 shrink-0" />
            <span>{t("profile")}</span>
          </Link>
        </nav>

        <div className="mt-auto flex flex-col gap-3 px-3">
          <div className="flex items-center gap-3">
            <ThemeSwitcher />
            <LocaleSwitcher />
          </div>
          <SignOutButton />
        </div>
      </aside>

      <header className="sm:hidden fixed top-0 inset-x-0 z-30 flex items-center justify-between px-4 py-3 border-b border-border bg-background">
        <BrandMark />
        <div className="flex items-center gap-1">
          <ThemeSwitcher />
          <LocaleSwitcher className="px-2" />
          <SignOutButton />
        </div>
      </header>

      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-30 flex items-center justify-around border-t border-border bg-background py-1.5">
        <Link
          href="/dashboard"
          className={`flex flex-col items-center gap-0.5 px-3 py-1 text-[11px] ${
            active === "home" ? "text-primary" : "text-muted"
          }`}
        >
          <HomeIcon className="h-6 w-6" />
          {t("home")}
        </Link>
        <MessagesTabItem active={active === "messages"} />
        <Link
          href="/profile"
          className={`flex flex-col items-center gap-0.5 px-3 py-1 text-[11px] ${
            active === "profile" ? "text-primary" : "text-muted"
          }`}
        >
          <ProfileIcon className="h-6 w-6" />
          {t("profile")}
        </Link>
      </nav>

      <main className="flex-1 min-w-0 h-screen overflow-y-auto pt-16 pb-20 sm:pt-0 sm:pb-0">{children}</main>
    </div>
  );
}
