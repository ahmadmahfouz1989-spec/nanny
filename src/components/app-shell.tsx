import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import BrandMark from "@/components/brand-mark";
import ThemeSwitcher from "@/components/theme-switcher";
import LocaleSwitcher from "@/components/locale-switcher";
import SignOutButton from "@/components/sign-out-button";
import NotificationBell from "@/components/notification-bell";
import { MessagesSidebarItem, MessagesTabItem } from "@/components/matches/messages-nav-item";
import { HomeIcon, ProfileIcon, GridIcon, FeedIcon, BookmarkIcon } from "@/components/nav-icons";
import CategoryIcon from "@/components/category-icon";
import { ToastProvider } from "@/components/toast-provider";
import { SavedProfilesProvider } from "@/components/saved-profiles-provider";

type ActiveKey = "categories" | "nanny" | "nursing" | "tutoring" | "feed" | "saved" | "messages" | "profile";

// The generic_profiles-based categories' nav entries (icon matches the one
// seeded on that category's row -- see category-icon.tsx). Nanny is
// handled separately below since it predates generic_profiles and uses
// its own icon/route shape.
const GENERIC_CATEGORY_NAV = [
  { slug: "nursing", icon: "hand" },
  { slug: "tutoring", icon: "book" },
] as const;

/**
 * The sidebar shows the category you're currently in, not every category
 * you've ever touched -- on the hub, feed, messages, or profile, none of
 * the category items show at all. Purely a function of `active`, no data
 * fetching needed: navigate back to /categories to switch.
 */
export default async function AppShell({
  active,
  children,
}: {
  active: ActiveKey;
  children: React.ReactNode;
}) {
  const t = await getTranslations("Nav");
  const currentGenericCategory = GENERIC_CATEGORY_NAV.find((c) => c.slug === active);

  return (
    <ToastProvider>
      <SavedProfilesProvider>
        <div className="flex min-h-screen">
          <aside className="hidden sm:flex sm:flex-col sm:w-60 shrink-0 border-e border-border px-3 py-5">
            <div className="px-3 mb-5">
              <BrandMark />
            </div>

            <nav className="flex flex-col gap-0.5">
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
              {active === "nanny" && (
                <Link
                  href="/dashboard"
                  className="flex items-center gap-3 rounded-xl px-3 py-2 text-[15px] bg-surface-sunken font-semibold text-ink"
                >
                  <HomeIcon className="h-[22px] w-[22px] shrink-0" />
                  <span>{t("nanny")}</span>
                </Link>
              )}
              <Link
                href="/feed"
                className={`flex items-center gap-3 rounded-xl px-3 py-2 text-[15px] transition-colors ${
                  active === "feed"
                    ? "bg-surface-sunken font-semibold text-ink"
                    : "text-muted hover:bg-surface-sunken hover:text-ink"
                }`}
              >
                <FeedIcon className="h-[22px] w-[22px] shrink-0" />
                <span>{t("feed")}</span>
              </Link>
              <Link
                href="/saved"
                className={`flex items-center gap-3 rounded-xl px-3 py-2 text-[15px] transition-colors ${
                  active === "saved"
                    ? "bg-surface-sunken font-semibold text-ink"
                    : "text-muted hover:bg-surface-sunken hover:text-ink"
                }`}
              >
                <BookmarkIcon className="h-[22px] w-[22px] shrink-0" />
                <span>{t("saved")}</span>
              </Link>
              {currentGenericCategory && (
                <Link
                  href={`/categories/${currentGenericCategory.slug}/dashboard`}
                  className="flex items-center gap-3 rounded-xl px-3 py-2 text-[15px] bg-surface-sunken font-semibold text-ink"
                >
                  <CategoryIcon name={currentGenericCategory.icon} className="h-[22px] w-[22px] shrink-0" />
                  <span>{t(currentGenericCategory.slug)}</span>
                </Link>
              )}
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
              href="/categories"
              className={`flex flex-col items-center gap-0.5 px-3 py-1 text-[11px] transition-colors ${
                active === "categories" ? "font-semibold text-primary" : "text-muted"
              }`}
            >
              <GridIcon className="h-[22px] w-[22px]" />
              {t("categories")}
            </Link>
            {active === "nanny" && (
              <Link href="/dashboard" className="flex flex-col items-center gap-0.5 px-3 py-1 text-[11px] font-semibold text-primary">
                <HomeIcon className="h-[22px] w-[22px]" />
                {t("nanny")}
              </Link>
            )}
            <Link
              href="/feed"
              className={`flex flex-col items-center gap-0.5 px-3 py-1 text-[11px] transition-colors ${
                active === "feed" ? "font-semibold text-primary" : "text-muted"
              }`}
            >
              <FeedIcon className="h-[22px] w-[22px]" />
              {t("feed")}
            </Link>
            {currentGenericCategory && (
              <Link
                href={`/categories/${currentGenericCategory.slug}/dashboard`}
                className="flex flex-col items-center gap-0.5 px-3 py-1 text-[11px] font-semibold text-primary"
              >
                <CategoryIcon name={currentGenericCategory.icon} className="h-[22px] w-[22px]" />
                {t(currentGenericCategory.slug)}
              </Link>
            )}
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

          <main className="flex-1 min-w-0 h-screen overflow-y-auto pt-16 pb-20 sm:pt-0 sm:pb-0">
            <div className="oui-in">{children}</div>
          </main>
        </div>
      </SavedProfilesProvider>
    </ToastProvider>
  );
}
