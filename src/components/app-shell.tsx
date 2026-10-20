import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import BrandMark from "@/components/brand-mark";
import ThemeSwitcher from "@/components/theme-switcher";
import LocaleSwitcher from "@/components/locale-switcher";
import SignOutButton from "@/components/sign-out-button";
import NotificationBell from "@/components/notification-bell";
import { MessagesSidebarItem, MessagesTabItem } from "@/components/matches/messages-nav-item";
import { ProfileIcon, GridIcon, FeedIcon, BookmarkIcon, HomeIcon } from "@/components/nav-icons";
import { NotificationsProvider } from "@/components/notifications/notifications-provider";
import { APP_MAIN_ID, HideOnScroll, MatchesTabItem, MobileHeader, NotificationsTabItem } from "@/components/shell/mobile-chrome";
import CategoryIcon from "@/components/category-icon";
import PullToRefresh from "@/components/shell/pull-to-refresh";
import { ToastProvider } from "@/components/toast-provider";
import { SavedProfilesProvider } from "@/components/saved-profiles-provider";
import InstallPrompt from "@/components/install-prompt";
import PushSync from "@/components/push-sync";
import PushPrompt from "@/components/push-prompt";
import type { CategorySlug } from "@/lib/category-slugs";
import { LAST_CATEGORY_COOKIE } from "@/lib/last-category";

type ActiveKey = "categories" | CategorySlug | "feed" | "saved" | "messages" | "notifications" | "profile";

const TAB = "flex flex-1 flex-col items-center gap-0.5 py-1 text-[11px] transition-colors";

// Each category's nav entry (icon matches the one seeded on that
// category's row -- see category-icon.tsx).
const CATEGORY_NAV = [
  { slug: "nanny", icon: "heart" },
  { slug: "nursing", icon: "hand" },
  { slug: "tutoring", icon: "book" },
  { slug: "maintenance", icon: "wrench" },
] as const satisfies readonly { slug: CategorySlug; icon: string }[];

/**
 * The sidebar lists every category you have a profile in (drafts don't
 * count), plus the one you're currently in, so your dashboards are always
 * one click away. On a phone the frame works like X's app: five fixed
 * tabs (Home, Matches -- the current category, else the last one you
 * were in, else your first --
 * Messages, Notifications, Profile), a top bar with your photo opening a
 * menu for everything else, and both bars sliding away as you scroll.
 */
export default async function AppShell({
  active,
  children,
}: {
  active: ActiveKey;
  children: React.ReactNode;
}) {
  const t = await getTranslations("Nav");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profiles } = user
    ? await supabase.from("generic_profiles").select("status, full_name, profile_photo_url, categories(slug)").eq("user_id", user.id).neq("status", "draft")
    : { data: null };
  const mySlugs = new Set((profiles ?? []).map((p) => p.categories?.slug));
  const sidebarCategories = CATEGORY_NAV.filter((c) => c.slug === active || mySlugs.has(c.slug));
  // The phone has one tab for your services: the one you're in, else the
  // one you were last in, else your first.
  const lastSlug = (await cookies()).get(LAST_CATEGORY_COOKIE)?.value;
  const tabCategory =
    sidebarCategories.find((c) => c.slug === active) ??
    sidebarCategories.find((c) => c.slug === lastSlug) ??
    sidebarCategories[0];
  // The phone's Matches tab is "where your matches are": the category hub or
  // any category's dashboard.
  const matchesActive = active === "categories" || CATEGORY_NAV.some((c) => c.slug === active);
  const myCategories = CATEGORY_NAV.filter((c) => mySlugs.has(c.slug));
  const services = myCategories.map((c) => ({ slug: c.slug, icon: c.icon, label: t(c.slug) }));
  const photoProfile = (profiles ?? []).find((p) => p.profile_photo_url) ?? profiles?.[0];
  const me = user ? { name: photoProfile?.full_name ?? null, photoUrl: photoProfile?.profile_photo_url ?? null } : null;

  return (
    <ToastProvider>
      <NotificationsProvider>
        <SavedProfilesProvider>
          <div className="flex min-h-dvh">
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
                {sidebarCategories.map((c) => (
                  <Link
                    key={c.slug}
                    href={`/categories/${c.slug}/dashboard`}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2 text-[15px] transition-colors ${
                      active === c.slug
                        ? "bg-surface-sunken font-semibold text-ink"
                        : "text-muted hover:bg-surface-sunken hover:text-ink"
                    }`}
                  >
                    <CategoryIcon name={c.icon} className="h-[22px] w-[22px] shrink-0" />
                    <span>{t(c.slug)}</span>
                  </Link>
                ))}
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

            <MobileHeader me={me} services={services} />
            <HideOnScroll />
            <PullToRefresh />

            <nav className="app-chrome-bottom sm:hidden fixed bottom-0 inset-x-0 z-30 flex items-center border-t border-border bg-background/90 backdrop-blur pt-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))]">
              <Link
                href="/feed"
                className={`${TAB} ${active === "feed" ? "font-semibold text-primary" : "text-muted"}`}
              >
                <HomeIcon className="h-[22px] w-[22px]" />
                {t("home")}
              </Link>
              <MatchesTabItem
                href={tabCategory ? `/categories/${tabCategory.slug}/dashboard` : "/categories"}
                slugs={myCategories.map((c) => c.slug)}
                active={matchesActive}
                className={TAB}
              />
              <MessagesTabItem active={active === "messages"} />
              <NotificationsTabItem active={active === "notifications"} className={TAB} />
              <Link
                href="/profile"
                className={`${TAB} ${active === "profile" ? "font-semibold text-primary" : "text-muted"}`}
              >
                <ProfileIcon className="h-[22px] w-[22px]" />
                {t("profile")}
              </Link>
            </nav>

            <InstallPrompt />
            <PushSync />
            <PushPrompt />

            <main id={APP_MAIN_ID} className="flex-1 min-w-0 h-dvh overflow-y-auto pt-[calc(3.5rem+env(safe-area-inset-top))] pb-[calc(5rem+env(safe-area-inset-bottom))] sm:pt-0 sm:pb-0">
              {/* No entrance animation here: sliding every page in made moving
                  around the app feel slow. h-full lets a page (Messages) fill
                  the screen. */}
              <div className="h-full">{children}</div>
            </main>
          </div>
        </SavedProfilesProvider>
      </NotificationsProvider>
    </ToastProvider>
  );
}
