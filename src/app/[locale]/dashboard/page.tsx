import { getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import BrandMark from "@/components/brand-mark";
import LocaleSwitcher from "@/components/locale-switcher";
import ThemeSwitcher from "@/components/theme-switcher";
import SignOutButton from "./sign-out-button";
import CreateProfileIllustration from "@/components/illustrations/create-profile-illustration";
import { ui } from "@/lib/ui";

export default async function DashboardPage({
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
    .select("role, email, phone, email_verified_at, phone_verified_at")
    .eq("id", user!.id)
    .single();

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
    <>
      <header className="flex items-center justify-between px-6 sm:px-10 py-6">
        <BrandMark />
        <div className="flex items-center gap-4">
          <ThemeSwitcher />
          <LocaleSwitcher />
          <SignOutButton />
        </div>
      </header>

      <main className="flex-1 max-w-lg mx-auto w-full px-6 py-10">
        <h1 className="font-display text-3xl font-semibold mb-8">{t("title")}</h1>

        <div className={ui.card + " p-6 mb-5"}>
          <p className="text-xs font-medium uppercase tracking-wide text-muted mb-4">
            {t("accountLabel")}
          </p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 text-sm">
            <dt className="text-muted">{t("role")}</dt>
            <dd className="font-medium">
              {profile?.role === "parent" && t("roleParent")}
              {profile?.role === "nanny" && t("roleNanny")}
              {profile?.role === "admin" && t("roleAdmin")}
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

        {profile?.role === "admin" ? (
          <div className={ui.card + " p-6"}>
            <p className="font-display text-lg font-semibold mb-1">{t("adminWelcomeTitle")}</p>
            <p className="text-sm text-muted mb-4">{t("adminWelcomeBody")}</p>
            <Link href="/admin" className={ui.buttonPrimary}>
              {t("goToAdmin")}
            </Link>
          </div>
        ) : (
        <div className={matchProfile ? ui.card + " p-6" : ui.card + " overflow-hidden"}>
          {matchProfile ? (
            <>
              <div className="flex items-center justify-between mb-2">
                <p className="font-display text-lg font-semibold">{t("yourProfile")}</p>
                <span className={ui.badge(moderationTone)}>
                  {matchProfile.moderation_status === "approved" && t("statusApproved")}
                  {matchProfile.moderation_status === "pending" && t("statusPending")}
                  {matchProfile.moderation_status === "rejected" && t("statusRejected")}
                </span>
              </div>
              <p className="text-sm text-muted mb-4">
                {matchProfile.moderation_status === "approved" && t("descriptionApproved")}
                {matchProfile.moderation_status === "pending" && t("descriptionPending")}
                {matchProfile.moderation_status === "rejected" && t("descriptionRejected")}
              </p>
              <Link href="/matches" className={ui.buttonPrimary}>
                {t("viewMatches")}
              </Link>
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
        )}
      </main>
    </>
  );
}
