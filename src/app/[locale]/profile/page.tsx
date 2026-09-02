import { getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/app-shell";
import MyRatings from "@/components/matches/my-ratings";
import CreateProfileIllustration from "@/components/illustrations/create-profile-illustration";
import { ui } from "@/lib/ui";

const MODERATION_BAND: Record<"success" | "warning" | "danger", string> = {
  success: "bg-success-soft",
  warning: "bg-warning-soft",
  danger: "bg-danger-soft",
};

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("Dashboard");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect({ href: "/login", locale });
  }

  const { data: profile } = await supabase
    .from("users")
    .select("role, email, phone, email_verified_at, phone_verified_at, subscribed_until")
    .eq("id", user!.id)
    .single();

  const subActive = !!profile?.subscribed_until && new Date(profile.subscribed_until) > new Date();

  if (profile?.role === "admin") {
    redirect({ href: "/admin", locale });
  }

  let matchProfile: { status: string; moderation_status: string } | null = null;
  if (profile?.role === "parent") {
    const { data } = await supabase
      .from("parent_profiles")
      .select("status, moderation_status")
      .eq("user_id", user!.id)
      .maybeSingle();
    matchProfile = data;
  } else if (profile?.role === "nanny") {
    const { data } = await supabase
      .from("nanny_profiles")
      .select("status, moderation_status")
      .eq("user_id", user!.id)
      .maybeSingle();
    matchProfile = data;
  }

  const moderationTone =
    matchProfile?.moderation_status === "approved"
      ? "success"
      : matchProfile?.moderation_status === "rejected"
        ? "danger"
        : "warning";

  return (
    <AppShell active="profile">
      <div className="max-w-lg mx-auto w-full px-6 py-8">
        <h1 className="font-display text-2xl font-bold mb-6">{t("yourProfile")}</h1>

        <div className={ui.card + " p-6 mb-5"}>
          <p className="text-xs font-medium uppercase tracking-wide text-muted mb-4">{t("accountLabel")}</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 text-sm">
            <dt className="text-muted">{t("role")}</dt>
            <dd className="font-medium">
              {profile?.role === "parent" && t("roleParent")}
              {profile?.role === "nanny" && t("roleNanny")}
            </dd>
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
          href="/subscribe"
          className={`${ui.card} p-4 mb-5 flex items-center justify-between gap-3 hover:border-primary/40 transition-colors ${
            subActive ? "bg-success-soft" : "bg-warning-soft"
          }`}
        >
          <div className="text-sm">
            <p className="font-medium">{t("subscriptionLabel")}</p>
            <p className="text-muted text-xs">
              {subActive
                ? t("subscribedUntil", { date: new Date(profile!.subscribed_until!).toLocaleDateString() })
                : t("notSubscribed")}
            </p>
          </div>
          <span className={ui.link + " text-sm shrink-0"}>{t("manageSubscription")}</span>
        </Link>

        <MyRatings />

        <div className={ui.card + " overflow-hidden"}>
          {matchProfile ? (
            <>
              <div className={`flex items-center justify-between px-6 py-4 ${MODERATION_BAND[moderationTone]}`}>
                <p className="font-display text-lg font-bold">{t("yourProfile")}</p>
                <span className={ui.badge(moderationTone)}>
                  {matchProfile.moderation_status === "approved" && t("statusApproved")}
                  {matchProfile.moderation_status === "pending" && t("statusPending")}
                  {matchProfile.moderation_status === "rejected" && t("statusRejected")}
                </span>
              </div>
              <div className="p-6">
                <p className="text-sm text-muted mb-4">
                  {matchProfile.moderation_status === "approved" && t("descriptionApproved")}
                  {matchProfile.moderation_status === "pending" && t("descriptionPending")}
                  {matchProfile.moderation_status === "rejected" && t("descriptionRejected")}
                </p>
                <div className="flex items-center gap-3">
                  {matchProfile.moderation_status === "approved" && (
                    <Link href="/dashboard" className={ui.buttonPrimary}>
                      {t("viewMatches")}
                    </Link>
                  )}
                  <Link href="/onboarding" className={ui.buttonSecondary}>
                    {t("editProfile")}
                  </Link>
                </div>
              </div>
            </>
          ) : (
            <>
              <CreateProfileIllustration className="w-full h-36" />
              <div className="p-6">
                <p className="font-display text-lg font-semibold mb-1">{t("noProfileTitle")}</p>
                <p className="text-sm text-muted mb-4">
                  {profile?.role === "parent" ? t("noProfileParent") : t("noProfileNanny")}
                </p>
                <Link href="/onboarding" className={ui.buttonPrimary}>
                  {t("createProfile")}
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
