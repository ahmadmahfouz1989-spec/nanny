import { redirect } from "@/i18n/navigation";
import { accountBasics, aboutYouHref } from "@/lib/account-basics";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { mustVerifyPhone } from "@/lib/phone-gate";
import { asAttributes } from "@/lib/attributes";
import { isCategorySlug } from "@/lib/category-slugs";
import AppShell from "@/components/app-shell";
import CategoryOnboardingClient from "./category-onboarding-client";

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

  if (!category || category.status !== "live" || !isCategorySlug(slug)) {
    redirect({ href: "/categories", locale });
  }

  // Name, phone, nationality and photo are asked once ("About you"), not here.
  const basics = await accountBasics(createAdminClient(), user!.id);
  if (!basics.complete) {
    redirect({ href: aboutYouHref(`/categories/${slug}/onboarding${role ? `?role=${role}` : ""}`), locale });
    return;
  }

  const [{ data: profiles }, { data: userRow }] = await Promise.all([
    supabase
      .from("generic_profiles")
      .select("id, role, full_name, profile_photo_url, location_id, attributes, status")
      .eq("user_id", user!.id)
      .eq("category_id", category!.id),
    supabase.from("users").select("contact_phone, full_name").eq("id", user!.id).single(),
  ]);

  const accountContactPhone = userRow?.contact_phone ?? null;
  // The name belongs to the account: every form shows the same one, so
  // saving one profile with an older name can't rename the others.
  const accountName = userRow?.full_name ?? null;
  const started = (profiles ?? []).some((p) => p.status !== "draft");
  if (!started && (await mustVerifyPhone(createAdminClient(), user!))) {
    redirect({ href: `/verify-phone?next=/categories/${slug}/onboarding${role ? `?role=${role}` : ""}`, locale });
  }
  // The account's basics fill every profile: the form doesn't ask them.
  const withContact = (p: NonNullable<typeof profiles>[number], role: "seeker" | "provider") => ({
    ...p,
    full_name: accountName ?? p.full_name,
    role,
    profile_photo_url: basics.photoUrl ?? p.profile_photo_url,
    attributes: { ...asAttributes(p.attributes), nationality: basics.nationality },
    contact_phone: basics.contactPhone ?? accountContactPhone,
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
  // From the welcome question ("I need help" / "I offer help"): no profile
  // for that side yet, so start it straight away instead of asking again.
  const startRole =
    (role === "seeker" && !seekerProfile) || (role === "provider" && !providerProfile) ? (role as "seeker" | "provider") : null;

  // Inside the app's usual frame (top bar with back, tabs), not a
  // separate-looking screen of its own.
  return (
    <AppShell active={isCategorySlug(slug) ? slug : "categories"}>
    <CategoryOnboardingClient
      categorySlug={slug}
      categoryName={locale === "ar" ? category!.name_ar : category!.name_en}
      seekerProfile={seekerProfile ? withContact(seekerProfile, "seeker") : null}
      providerProfile={providerProfile ? withContact(providerProfile, "provider") : null}
      initialRole={initialRole}
      startRole={startRole}
      // The account's shared contact_phone, independent of whether a
      // profile already exists in *this* category -- without this,
      // claiming a role in a brand-new category has no way to know the
      // phone already saved via another category, and would submit this
      // form's blank field as a real update, wiping it out account-wide.
      accountContactPhone={accountContactPhone}
    />
    </AppShell>
  );
}
