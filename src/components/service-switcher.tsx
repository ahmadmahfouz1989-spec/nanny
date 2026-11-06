import { getLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import ServiceChips from "@/components/service-chips";

/**
 * The services you're in, as chips at the top of Matches, so the tab
 * says which service it's showing and switching to another is one tap
 * (not a trip through the menu). The current one is highlighted; "Add"
 * leads to the rest. Nothing is shown when you're only in one service and
 * it's this one -- the page title already names it. Also on a service's
 * browse page, so looking at a new one never loses your way back.
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
  // Just the one, and you're in it: the page title already names it.
  if (services.length === 0 || (services.length === 1 && services[0].slug === current)) return null;

  return (
    <ServiceChips
      current={current}
      label={t("yourServices")}
      addLabel={t("addService")}
      services={services.map((c) => ({ slug: c.slug, icon: c.icon, name: locale === "ar" ? c.name_ar : c.name_en }))}
    />
  );
}
