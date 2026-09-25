import { getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/app-shell";
import MyRatings from "@/components/matches/my-ratings";
import MyPostsCard from "@/components/my-posts-card";
import ProfileTabs, { type ProfileTabDef } from "@/components/profile-tabs";
import { ui } from "@/lib/ui";

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("Dashboard");
  const tNav = await getTranslations("Nav");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect({ href: "/login", locale });
  }

  const { data: profile } = await supabase
    .from("users")
    .select("role, email, phone, email_verified_at, phone_verified_at, featured_until")
    .eq("id", user!.id)
    .single();

  const isFeatured = !!profile?.featured_until && new Date(profile.featured_until) > new Date();

  if (profile?.role === "admin") {
    redirect({ href: "/admin", locale });
  }

  const hasNannyTrack = profile?.role === "parent" || profile?.role === "nanny";

  let matchProfile: { status: string; moderation_status: string; full_name: string; profile_photo_url?: string | null } | null =
    null;
  if (profile?.role === "parent") {
    const { data } = await supabase
      .from("parent_profiles")
      .select("status, moderation_status, full_name, profile_photo_url")
      .eq("user_id", user!.id)
      .maybeSingle();
    matchProfile = data;
  } else if (profile?.role === "nanny") {
    const { data } = await supabase
      .from("nanny_profiles")
      .select("status, moderation_status, full_name, profile_photo_url")
      .eq("user_id", user!.id)
      .maybeSingle();
    matchProfile = data;
  }

  const { data: genericRows } = await supabase
    .from("generic_profiles")
    .select("id, role, category_id, full_name, status, moderation_status, categories(slug, name_en, name_ar)")
    .eq("user_id", user!.id);

  // A draft is just a claimed role with nothing filled in yet -- same
  // "not really a profile" rule used everywhere else this shows up
  // (categories/[slug]/dashboard, the admin queue).
  const genericProfiles = (genericRows ?? []).filter((p) => p.status !== "draft");

  // "Profile" is a global nav tab, not scoped to a category -- unlike
  // /dashboard (nanny's own route, reached by choosing "Nanny" on the
  // hub), it must never assume nanny. Only bounce out to the hub when
  // there's truly nothing to show on any track yet.
  if (!hasNannyTrack && genericProfiles.length === 0) {
    redirect({ href: "/categories", locale });
    return;
  }

  const roleLabel = profile?.role === "nanny" ? t("roleNanny") : t("roleParent");

  const tabs: ProfileTabDef[] = [
    ...(hasNannyTrack
      ? [
          {
            kind: "nanny" as const,
            key: "nanny",
            label: tNav("nanny"),
            fullName: matchProfile?.full_name ?? null,
            roleLabel,
            isNanny: profile?.role === "nanny",
            initialPhotoUrl: matchProfile?.profile_photo_url ?? null,
            matchProfile,
          },
        ]
      : []),
    ...genericProfiles.map((p) => {
      const category = p.categories as unknown as { slug: string; name_en: string; name_ar: string } | null;
      const categoryLabel = category ? (locale === "ar" ? category.name_ar : category.name_en) : "";
      const roleLabel = p.role === "provider" ? t("roleProvider") : t("roleSeeker");
      // Two profiles in one category (seeking + offering) would otherwise
      // get two identical tabs.
      const sharesCategory = genericProfiles.some((o) => o.id !== p.id && o.category_id === p.category_id);
      return {
        kind: "generic" as const,
        key: p.id,
        label: sharesCategory ? `${categoryLabel} · ${roleLabel}` : categoryLabel,
        slug: category?.slug ?? "",
        role: p.role as "seeker" | "provider",
        categoryLabel,
        roleLabel,
        fullName: p.full_name,
        moderationStatus: p.moderation_status,
      };
    }),
  ];

  return (
    <AppShell active="profile">
      <div className="max-w-lg w-full mx-auto px-6 py-8">
        <h1 className="font-display text-2xl font-bold mb-6">{t("yourProfile")}</h1>

        <ProfileTabs tabs={tabs} />

        <div className={ui.card + " p-6 mb-5"}>
          <p className="text-xs font-medium uppercase tracking-wide text-muted mb-4">{t("accountLabel")}</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 text-sm">
            <dt className="text-muted">{t("email")}</dt>
            <dd className="flex items-center gap-2">
              {profile?.email ?? "—"}
              {profile?.email && (
                <span className={ui.badge(profile.email_verified_at ? "success" : "warning")}>
                  {profile.email_verified_at ? t("verified") : t("unverified")}
                </span>
              )}
            </dd>
            <dt className="text-muted">{t("phone")}</dt>
            <dd className="flex items-center gap-2">
              {profile?.phone ?? "—"}
              {profile?.phone && (
                <span className={ui.badge(profile.phone_verified_at ? "success" : "warning")}>
                  {profile.phone_verified_at ? t("verified") : t("unverified")}
                </span>
              )}
            </dd>
          </dl>
        </div>

        <Link
          href="/featured"
          className={`${ui.cardHover} p-4 mb-5 flex items-center justify-between gap-3 hover:border-primary/40 ${
            isFeatured ? "bg-success-soft" : ""
          }`}
        >
          <div className="text-sm">
            <p className="font-medium">{t("featuredLabel")}</p>
            <p className="text-muted text-xs">
              {isFeatured
                ? t("featuredUntilLabel", { date: new Date(profile!.featured_until!).toLocaleDateString() })
                : t("notFeaturedLabel")}
            </p>
          </div>
          <span className={ui.link + " text-sm shrink-0"}>{t("manageFeatured")}</span>
        </Link>

        <Link href="/saved" className={`${ui.cardHover} p-4 mb-5 flex items-center justify-between gap-3 hover:border-primary/40 sm:hidden`}>
          <p className="text-sm font-medium">{tNav("saved")}</p>
          <span aria-hidden className="text-muted rtl:scale-x-[-1]">→</span>
        </Link>

        <MyRatings />

        <MyPostsCard />
      </div>
    </AppShell>
  );
}
