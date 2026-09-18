import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import CategoryOnboardingClient from "./category-onboarding-client";

// Each entry here also needs a schema pair in CATEGORY_SCHEMAS
// (src/app/api/generic-profile/route.ts) and a form pair rendered by
// CategoryOnboardingClient before it can actually onboard.
const SUPPORTED_SLUGS = ["nursing", "tutoring"];

export default async function CategoryOnboardingPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
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
      .select("id, role, full_name, location_id, attributes, status")
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
    />
  );
}
