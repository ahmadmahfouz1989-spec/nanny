import { getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/app-shell";
import CreateProfileIllustration from "@/components/illustrations/create-profile-illustration";
import NannyResults from "@/components/matches/nanny-results";
import FamilyResults from "@/components/matches/family-results";
import { ui } from "@/lib/ui";

const MODERATION_BAND: Record<"success" | "warning" | "danger", string> = {
  success: "bg-success-soft",
  warning: "bg-warning-soft",
  danger: "bg-danger-soft",
};

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

  const { data: profile } = await supabase.from("users").select("role").eq("id", user!.id).single();

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

  if (matchProfile?.moderation_status === "approved") {
    return (
      <AppShell active="nanny">
        {profile?.role === "parent" ? <NannyResults /> : <FamilyResults />}
      </AppShell>
    );
  }

  const moderationTone =
    matchProfile?.moderation_status === "rejected" ? "danger" : "warning";

  return (
    <AppShell active="nanny">
      <div className="max-w-lg mx-auto w-full px-6 py-8">
        <h1 className="font-display text-2xl font-bold mb-6">{t("title")}</h1>

        <div className={ui.card + " overflow-hidden"}>
          {matchProfile ? (
            <>
              <div className={`flex items-center justify-between px-6 py-4 ${MODERATION_BAND[moderationTone]}`}>
                <p className="font-display text-lg font-bold">{t("yourProfile")}</p>
                <span className={ui.badge(moderationTone)}>
                  {matchProfile.moderation_status === "pending" && t("statusPending")}
                  {matchProfile.moderation_status === "rejected" && t("statusRejected")}
                </span>
              </div>
              <div className="p-6">
                <p className="text-sm text-muted">
                  {matchProfile.moderation_status === "pending" && t("descriptionPending")}
                  {matchProfile.moderation_status === "rejected" && t("descriptionRejected")}
                </p>
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
