import { getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/app-shell";
import CategoryGrid from "@/components/category-grid";
import { getCategories } from "@/lib/categories";

export default async function CategoriesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("Categories");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect({ href: "/login", locale });
  }

  const categories = await getCategories();

  return (
    <AppShell active="categories">
      <div className="max-w-3xl mx-auto w-full px-6 py-8">
        <h1 className="font-display text-2xl font-bold mb-1">{t("hubTitle")}</h1>
        <p className="text-muted text-sm mb-6">{t("hubSubtitle")}</p>
        <CategoryGrid categories={categories} locale={locale} comingSoonLabel={t("comingSoon")} />
      </div>
    </AppShell>
  );
}
