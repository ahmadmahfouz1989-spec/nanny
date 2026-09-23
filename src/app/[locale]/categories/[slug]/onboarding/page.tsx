import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import CategoryOnboardingClient from "./category-onboarding-client";

// Each entry here also needs a schema pair in CATEGORY_SCHEMAS
// (src/app/api/generic-profile/route.ts) and a form pair rendered by
// CategoryOnboardingClient before it can actually onboard.
const SUPPORTED_SLUGS = ["nursing", "tutoring"];

export default async function CategoryOnboardingPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ role?: string }>;
}) {
  const { locale, slug } = await params;
  const { role } = await searchParams;
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

  const accountContactPhone = userRow?.contact_phone ?? null;
  const withContact = (p: NonNullable<typeof profiles>[number]) => ({
    ...p,
    contact_phone: accountContactPhone,
  });
  const seekerProfile = (profiles ?? []).find((p) => p.role === "seeker");
  const providerProfile = (profiles ?? []).find((p) => p.role === "provider");
  // The dashboard's per-role tabs (category-dashboard-tabs.tsx) link here
  // with ?role= so Edit always reopens the exact role being viewed --
  // without it, an account holding both roles always lands on the
  // provider form (CategoryOnboardingClient's own default), regardless of
  // which tab Edit was clicked from. Only trusted when that role's own
  // profile actually exists; otherwise falls through to that same default.
  const initialRole =
    role === "seeker" && seekerProfile ? "seeker" : role === "provider" && providerProfile ? "provider" : null;

  return (
    <CategoryOnboardingClient
      categorySlug={slug}
      categoryName={locale === "ar" ? category!.name_ar : category!.name_en}
      seekerProfile={seekerProfile ? withContact(seekerProfile) : null}
      providerProfile={providerProfile ? withContact(providerProfile) : null}
      initialRole={initialRole}
      // The account's shared contact_phone, independent of whether a
      // profile already exists in *this* category -- without this,
      // claiming a role in a brand-new category has no way to know the
      // phone already saved via another category, and would submit this
      // form's blank field as a real update, wiping it out account-wide.
      accountContactPhone={accountContactPhone}
    />
  );
}
