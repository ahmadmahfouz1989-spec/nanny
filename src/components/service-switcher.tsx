import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import CategoryIcon from "@/components/category-icon";

/**
 * The services you're in, as chips at the top of Matches, so the tab
 * says which service it's showing and switching to another is one tap
 * (not a trip through the menu). The current one is highlighted; "Add"
 * leads to the rest. Nothing is shown when you're only in one service and
 * it's this one -- the page title already names it.
 */
export default async function ServiceSwitcher({ current }: { current: string }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const t = await getTranslations("Dashboard");
  const locale = await getLocale();

  const { data } = await supabase
    .from("generic_profiles")
    .select("categories(slug, name_en, name_ar, icon, sort_order)")
    .eq("user_id", user.id)
    .neq("status", "draft");
  const seen = new Set<string>();
  const services = (data ?? [])
    .map((p) => p.categories)
    .filter((c): c is NonNullable<typeof c> => !!c && !seen.has(c.slug) && !!seen.add(c.slug))
    .sort((a, b) => a.sort_order - b.sort_order);
  if (services.length < 2) return null;

  return (
    <nav aria-label={t("yourServices")} className="-mx-6 mb-5 flex gap-2 overflow-x-auto px-6 pb-1 [scrollbar-width:none]">
      {services.map((c) => {
        const active = c.slug === current;
        return (
          <Link
            key={c.slug}
            href={`/categories/${c.slug}/dashboard`}
            replace
            aria-current={active ? "page" : undefined}
            className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium transition-colors ${
              active ? "border-ink bg-ink text-background" : "border-border bg-surface text-ink/80 hover:border-border-strong"
            }`}
          >
            <CategoryIcon name={c.icon} className="h-4 w-4" />
            {locale === "ar" ? c.name_ar : c.name_en}
          </Link>
        );
      })}
      <Link
        href="/categories"
        className="flex shrink-0 items-center gap-1 rounded-full border border-dashed border-border-strong px-3.5 py-2 text-sm font-medium text-muted hover:text-ink"
      >
        + {t("addService")}
      </Link>
    </nav>
  );
}
