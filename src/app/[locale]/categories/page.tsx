import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/app-shell";
import CategoryTiles from "@/components/category-tiles";
import { getCategories } from "@/lib/categories";

export default async function CategoriesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("Categories");
  const tDash = await getTranslations("Dashboard");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Open to visitors too: a service tile takes them to its providers.
  const categories = (await getCategories()).map((c) => (user ? c : { ...c, href: c.href ? `/browse/${c.slug}` : null }));

  // Your own services say so, and on which side, so "add" isn't a list of everything alike.
  const { data: profiles } = user
    ? await supabase.from("generic_profiles").select("role, categories(slug)").eq("user_id", user.id).neq("status", "draft").order("role")
    : { data: null };
  const mine: Record<string, string> = {};
  for (const p of profiles ?? []) {
    const slug = p.categories?.slug;
    if (!slug) continue;
    const side = p.role === "provider" ? tDash("roleProvider") : tDash("roleSeeker");
    mine[slug] = mine[slug] ? `${mine[slug]} + ${side}` : side;
  }

  return (
    <AppShell active="categories">
      <div className="max-w-4xl w-full mx-auto px-4 py-6 sm:px-6 sm:py-8">
        <h1 className="font-display text-2xl font-bold mb-1">{t("hubTitle")}</h1>
        <p className="text-muted text-sm mb-6">{t("hubSubtitle")}</p>
        {/* The same tiles as Home, so a service looks the same everywhere. */}
        <CategoryTiles categories={categories} locale={locale} comingSoon={t("comingSoon")} mine={mine} />
        <p className="text-center text-xs text-muted mt-6">{t("moreComingSoon")}</p>
      </div>
    </AppShell>
  );
}
