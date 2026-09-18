import { getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/app-shell";
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

  // Nothing real submitted yet -- no role chosen at all, or a role
  // claimed with no profile behind it -- straight to the role picker
  // rather than a "no profile yet, click here" dead end.
  if (!matchProfile) {
    redirect({ href: "/categories/nanny/onboarding", locale });
    return;
  }

  if (matchProfile.moderation_status === "approved") {
    return (
      <AppShell active="nanny">
        {profile?.role === "parent" ? <NannyResults /> : <FamilyResults />}
      </AppShell>
    );
  }

  const moderationTone =
    matchProfile.moderation_status === "rejected" ? "danger" : "warning";

  return (
    <AppShell active="nanny">
      <div className="max-w-lg w-full mx-auto px-6 py-8">
        <h1 className="font-display text-2xl font-bold mb-6">{t("title")}</h1>

        <div className={ui.card + " overflow-hidden"}>
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
        </div>
      </div>
    </AppShell>
  );
}
