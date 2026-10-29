import { cookies } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
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
import { ClipboardIcon, GearIcon } from "@/components/home-icons";
import PullToRefresh from "@/components/shell/pull-to-refresh";
import { ToastProvider } from "@/components/toast-provider";
import { SavedProfilesProvider } from "@/components/saved-profiles-provider";
import InstallPrompt from "@/components/install-prompt";
import PushSync from "@/components/push-sync";
import PushPrompt from "@/components/push-prompt";
import type { CategorySlug } from "@/lib/category-slugs";
import { LAST_CATEGORY_COOKIE } from "@/lib/last-category";
import { REGION_COOKIE } from "@/lib/region";

type ActiveKey = "categories" | CategorySlug | "feed" | "saved" | "messages" | "notifications" | "profile";

const TAB = "flex flex-1 flex-col items-center gap-0.5 py-1 text-[11px] transition-colors";

// Each category's nav entry (icon matches the one seeded on that
// category's row -- see category-icon.tsx).
const CATEGORY_NAV = [
  { slug: "nanny", icon: "heart" },
  { slug: "nursing", icon: "hand" },
  { slug: "tutoring", icon: "book" },
  { slug: "maintenance", icon: "wrench" },
  { slug: "errands", icon: "scooter" },
] as const satisfies readonly { slug: CategorySlug; icon: string }[];

/**
 * The sidebar lists every category you have a profile in (drafts don't
 * count), plus the one you're currently in, so your dashboards are always
 * one click away. On a phone the frame works like X's app: four tabs
 * (Home, Matches -- the current category, else the last one you were in,
 * else your first -- Messages, Notifications), a top bar with your photo
 * opening a menu for everything else, and the top bar sliding away as you
 * scroll (the tabs stay).
 */
export default async function AppShell({
  active,
  children,
}: {
  active: ActiveKey;
  children: React.ReactNode;
}) {
  const t = await getTranslations("Nav");
  const tm = await getTranslations("Menu");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profiles } = user
    ? await supabase.from("generic_profiles").select("id, role, status, full_name, profile_photo_url, categories(slug), locations(name_en, name_ar)").eq("user_id", user.id).neq("status", "draft")
    : { data: null };
  const mySlugs = new Set((profiles ?? []).map((p) => p.categories?.slug));
  const sidebarCategories = CATEGORY_NAV.filter((c) => c.slug === active || mySlugs.has(c.slug));
  // The phone has one tab for your services: the one you're in, else the
  // one you were last in, else your first.
  const cookieStore = await cookies();
  const lastSlug = cookieStore.get(LAST_CATEGORY_COOKIE)?.value;
  const region = cookieStore.get(REGION_COOKIE)?.value ?? "";
  const tabCategory =
    sidebarCategories.find((c) => c.slug === active) ??
    sidebarCategories.find((c) => c.slug === lastSlug) ??
    sidebarCategories[0];
  // The phone's Matches tab is "where your matches are": the category hub or
  // any category's dashboard.
  const matchesActive = active === "categories" || CATEGORY_NAV.some((c) => c.slug === active);
  const myCategories = CATEGORY_NAV.filter((c) => mySlugs.has(c.slug));
  // "Nanny · your request": a family's need and a provider's profile are
  // both called profiles in the data, but not to the people using them.
  const services = myCategories.map((c) => {
    const roles = new Set((profiles ?? []).filter((p) => p.categories?.slug === c.slug).map((p) => p.role));
    const mine = [roles.has("seeker") && tm("roleSeeker"), roles.has("provider") && tm("roleProvider")].filter(Boolean);
    return { slug: c.slug, icon: c.icon, label: [t(c.slug), mine.join(" + ")].filter(Boolean).join(" · ") };
  });
  const photoProfile = (profiles ?? []).find((p) => p.profile_photo_url) ?? profiles?.[0];
  const { data: account } = user
    ? await supabase.from("users").select("email_verified_at, phone_verified_at").eq("id", user.id).maybeSingle()
    : { data: null };
  // An ID an admin approved, on any of your profiles (RLS: only your own rows).
  const { count: idCount } = user && profiles?.length
    ? await supabase.from("id_documents").select("profile_id", { count: "exact", head: true }).eq("status", "approved").in("profile_id", profiles.map((p) => p.id))
    : { count: 0 };
  const idChecked = !!idCount;
  const place = photoProfile?.locations;
  const locale = await getLocale();
  const me = user
    ? {
        name: photoProfile?.full_name ?? null,
        photoUrl: photoProfile?.profile_photo_url ?? null,
        profileId: photoProfile?.id ?? null,
        place: place ? (locale === "ar" ? place.name_ar : place.name_en) : null,
        checks: {
          email: !!account?.email_verified_at,
          phone: !!account?.phone_verified_at,
          id: idChecked,
        },
      }
    : null;

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
                <Link
                  href="/requests"
                  className="flex items-center gap-3 rounded-xl px-3 py-2 text-[15px] text-muted transition-colors hover:bg-surface-sunken hover:text-ink"
                >
                  <ClipboardIcon className="h-[22px] w-[22px] shrink-0" />
                  <span>{tm("myRequests")}</span>
                </Link>
                <Link
                  href="/settings"
                  className="flex items-center gap-3 rounded-xl px-3 py-2 text-[15px] text-muted transition-colors hover:bg-surface-sunken hover:text-ink"
                >
                  <GearIcon className="h-[22px] w-[22px] shrink-0" />
                  <span>{tm("settings")}</span>
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

            <MobileHeader me={me} services={services} region={region} />
            <HideOnScroll />
            <PullToRefresh />

            <nav className="app-chrome-bottom sm:hidden fixed bottom-0 inset-x-0 z-30 flex items-center border-t border-border bg-background/90 backdrop-blur pt-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))]">
              {/* Tabs switch places rather than stacking up, so back never
                  walks you through the tabs you tapped. */}
              <Link
                href="/feed"
                replace
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
              {/* Your profile, Saved, your services and settings live in
                  the menu behind your photo, as on X -- not here too. */}
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
