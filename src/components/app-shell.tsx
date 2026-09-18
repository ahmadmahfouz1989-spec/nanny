import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import BrandMark from "@/components/brand-mark";
import ThemeSwitcher from "@/components/theme-switcher";
import LocaleSwitcher from "@/components/locale-switcher";
import SignOutButton from "@/components/sign-out-button";
import NotificationBell from "@/components/notification-bell";
import { MessagesSidebarItem, MessagesTabItem } from "@/components/matches/messages-nav-item";
import { HomeIcon, ProfileIcon, GridIcon, FeedIcon } from "@/components/nav-icons";
import CategoryIcon from "@/components/category-icon";

type ActiveKey = "categories" | "nanny" | "nursing" | "tutoring" | "feed" | "messages" | "profile";

// Every generic_profiles-based category gets an entry here (icon matches
// the one seeded on its categories row -- see category-icon.tsx). Nanny
// isn't here since it's not generic_profiles-based; it's handled by
// showNanny separately below.
const GENERIC_CATEGORY_NAV = [
  { slug: "nursing", icon: "hand" },
  { slug: "tutoring", icon: "book" },
] as const;

/**
 * A category's nav item only earns a slot once the user actually has a
 * profile there -- the categories hub stays the discovery surface for
 * everyone else. Computed here (not passed in by each caller) so it's
 * automatically correct on every page, including ones like the hub itself
 * that aren't "inside" any specific category.
 */
async function resolveCategoryNav() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { showNanny: false, visibleGenericSlugs: new Set<string>() };

  const [{ data: profile }, { data: categories }, { data: myProfiles }] = await Promise.all([
    supabase.from("users").select("role").eq("id", user.id).single(),
    supabase
      .from("categories")
      .select("id, slug")
      .in(
        "slug",
        GENERIC_CATEGORY_NAV.map((c) => c.slug),
      ),
    supabase.from("generic_profiles").select("category_id").eq("user_id", user.id),
  ]);

  const showNanny = profile?.role === "parent" || profile?.role === "nanny";

  const myCategoryIds = new Set((myProfiles ?? []).map((p) => p.category_id));
  const visibleGenericSlugs = new Set(
    (categories ?? []).filter((c) => myCategoryIds.has(c.id)).map((c) => c.slug),
  );

  return { showNanny, visibleGenericSlugs };
}

export default async function AppShell({
  active,
  children,
}: {
  active: ActiveKey;
  children: React.ReactNode;
}) {
  const t = await getTranslations("Nav");
  const { showNanny, visibleGenericSlugs } = await resolveCategoryNav();
  const visibleGenericCategories = GENERIC_CATEGORY_NAV.filter((c) => visibleGenericSlugs.has(c.slug));

  return (
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
          {showNanny && (
            <Link
              href="/dashboard"
              className={`flex items-center gap-3 rounded-xl px-3 py-2 text-[15px] transition-colors ${
                active === "nanny"
                  ? "bg-surface-sunken font-semibold text-ink"
                  : "text-muted hover:bg-surface-sunken hover:text-ink"
              }`}
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
          {visibleGenericCategories.map((c) => (
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
        {showNanny && (
          <Link
            href="/dashboard"
            className={`flex flex-col items-center gap-0.5 px-3 py-1 text-[11px] transition-colors ${
              active === "nanny" ? "font-semibold text-primary" : "text-muted"
            }`}
          >
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
        {visibleGenericCategories.map((c) => (
          <Link
            key={c.slug}
            href={`/categories/${c.slug}/dashboard`}
            className={`flex flex-col items-center gap-0.5 px-3 py-1 text-[11px] transition-colors ${
              active === c.slug ? "font-semibold text-primary" : "text-muted"
            }`}
          >
            <CategoryIcon name={c.icon} className="h-[22px] w-[22px]" />
            {t(c.slug)}
          </Link>
        ))}
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
  );
}
