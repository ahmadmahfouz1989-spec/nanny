import { getTranslations } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import { ui } from "@/lib/ui";
import CategoryIcon from "@/components/category-icon";
import { ChevronIcon } from "@/components/home-icons";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/app-shell";
import OrdersClient from "./orders-client";

/**
 * Activity: Delivery & Errands orders and repair quotes (the customer's,
 * and the requests reaching a provider), then the requests they've made in
 * each service and their posts -- what they've asked for, in one place.
 */
export default async function OrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { locale } = await params;
  const { tab } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect({ href: "/login", locale });

  const t = await getTranslations("Orders");
  const { data: requests } = await supabase
    .from("generic_profiles")
    .select("id, categories(slug, name_en, name_ar, icon)")
    .eq("user_id", user!.id)
    .eq("role", "seeker")
    .neq("status", "draft");

  return (
    <AppShell active="orders">
      <OrdersClient initialTab={tab === "provider" ? "provider" : "seeker"} />
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-4 pb-8">
        {(requests ?? []).length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="font-display text-lg font-semibold text-ink">{t("yourRequests")}</h2>
            <p className="-mt-1 text-sm text-muted">{t("yourRequestsHint")}</p>
            <div className={ui.card + " divide-y divide-border"}>
              {(requests ?? []).map((r) =>
                r.categories ? (
                  <Link key={r.id} href={`/categories/${r.categories.slug}/dashboard`} className="flex items-center gap-3 p-3 transition hover:bg-surface-sunken">
                    <CategoryIcon name={r.categories.icon} className="h-6 w-6 shrink-0 text-muted" />
                    <span className="flex-1 font-medium text-ink">{locale === "ar" ? r.categories.name_ar : r.categories.name_en}</span>
                    <ChevronIcon className="h-4 w-4 shrink-0 text-muted" />
                  </Link>
                ) : null,
              )}
            </div>
          </section>
        )}
        <Link href="/requests" className={ui.card + " flex items-center gap-3 p-3 transition hover:bg-surface-sunken"}>
          <span className="flex-1 font-medium text-ink">{t("yourPosts")}</span>
          <ChevronIcon className="h-4 w-4 shrink-0 text-muted" />
        </Link>
      </div>
    </AppShell>
  );
}
