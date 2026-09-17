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

type ActiveKey = "categories" | "nanny" | "nursing" | "feed" | "messages" | "profile";

/**
 * A category's nav item only earns a slot once the user actually has a
 * profile there -- the categories hub stays the discovery surface for
 * everyone else. Computed here (not passed in by each caller) so it's
 * automatically correct on every page, including ones like the hub itself
 * that aren't "inside" any specific category. Only nanny (users.role) and
 * nursing (generic_profiles) exist as categories today; a third category
 * needs a similar check added here.
 */
async function resolveCategoryNav() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { showNanny: false, showNursing: false };

  const [{ data: profile }, { data: nursingCategory }] = await Promise.all([
    supabase.from("users").select("role").eq("id", user.id).single(),
    supabase.from("categories").select("id").eq("slug", "nursing").maybeSingle(),
  ]);

  const showNanny = profile?.role === "parent" || profile?.role === "nanny";

  let showNursing = false;
  if (nursingCategory) {
    const { data: nursingProfile } = await supabase
      .from("generic_profiles")
      .select("id")
      .eq("user_id", user.id)
      .eq("category_id", nursingCategory.id)
      .maybeSingle();
    showNursing = !!nursingProfile;
  }

  return { showNanny, showNursing };
}

export default async function AppShell({
  active,
  children,
}: {
  active: ActiveKey;
  children: React.ReactNode;
}) {
  const t = await getTranslations("Nav");
  const { showNanny, showNursing } = await resolveCategoryNav();

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
          {showNursing && (
            <Link
              href="/categories/nursing/dashboard"
              className={`flex items-center gap-3 rounded-xl px-3 py-2 text-[15px] transition-colors ${
                active === "nursing"
                  ? "bg-surface-sunken font-semibold text-ink"
                  : "text-muted hover:bg-surface-sunken hover:text-ink"
              }`}
            >
              <CategoryIcon name="hand" className="h-[22px] w-[22px] shrink-0" />
              <span>{t("nursing")}</span>
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
        {showNursing && (
          <Link
            href="/categories/nursing/dashboard"
            className={`flex flex-col items-center gap-0.5 px-3 py-1 text-[11px] transition-colors ${
              active === "nursing" ? "font-semibold text-primary" : "text-muted"
            }`}
          >
            <CategoryIcon name="hand" className="h-[22px] w-[22px]" />
            {t("nursing")}
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
  );
}
