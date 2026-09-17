import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import CategoryOnboardingClient from "./category-onboarding-client";

// v1 only wires up a schema for nursing (see CATEGORY_SCHEMAS in
// src/app/api/generic-profile/route.ts); a future category needs an entry
// there before this page can onboard it.
const SUPPORTED_SLUGS = ["nursing"];

export default async function CategoryOnboardingPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ role?: string }>;
}) {
  const { locale, slug } = await params;
  const { role: roleHintParam } = await searchParams;
  const roleHint = roleHintParam === "seeker" || roleHintParam === "provider" ? roleHintParam : null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect({ href: "/login", locale });
  }

  const { data: category } = await supabase
    .from("categories")
    .select("id, slug, status, name_en, name_ar")
    .eq("slug", slug)
    .maybeSingle();

  if (!category || category.status !== "live" || !SUPPORTED_SLUGS.includes(slug)) {
    redirect({ href: "/categories", locale });
  }

  const [{ data: profiles }, { data: userRow }] = await Promise.all([
    supabase
      .from("generic_profiles")
      .select("id, role, full_name, location_id, attributes")
      .eq("user_id", user!.id)
      .eq("category_id", category!.id),
    supabase.from("users").select("contact_phone").eq("id", user!.id).single(),
  ]);

  const withContact = (p: NonNullable<typeof profiles>[number]) => ({
    ...p,
    contact_phone: userRow?.contact_phone ?? null,
  });
  const seekerProfile = (profiles ?? []).find((p) => p.role === "seeker");
  const providerProfile = (profiles ?? []).find((p) => p.role === "provider");

  return (
    <CategoryOnboardingClient
      categorySlug={slug}
      categoryName={locale === "ar" ? category!.name_ar : category!.name_en}
      seekerProfile={seekerProfile ? withContact(seekerProfile) : null}
      providerProfile={providerProfile ? withContact(providerProfile) : null}
      roleHint={roleHint}
    />
  );
}
