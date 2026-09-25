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
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ match?: string }>;
}) {
  const { locale } = await params;
  // Set by match notifications -- the card to land on (see useLiveMatches).
  const { match: targetMatchId = null } = await searchParams;
  const t = await getTranslations("Dashboard");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect({ href: "/login", locale });
  }

  const { data: profile } = await supabase.from("users").select("role").eq("id", user!.id).single();

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

  // A role already claimed (nanny/parent) but nothing filled in yet --
  // straight to the role picker rather than a "no profile yet, click
  // here" dead end. Same nanny-only flow as before: claiming nanny/parent
  // already commits to this category specifically.
  if ((profile?.role === "parent" || profile?.role === "nanny") && !matchProfile) {
    redirect({ href: "/categories/nanny/onboarding", locale });
    return;
  }

  // No nanny/parent role at all -- this account may still have a real
  // profile in another category (nursing, tutoring) from generic_profiles,
  // which this legacy nanny-only dashboard has no way to render. Send them
  // to wherever they actually belong instead of forcing nanny onboarding
  // on a returning nursing/tutoring user, or defaulting a genuinely new
  // account into nanny specifically now that categories are ala carte.
  if (!matchProfile) {
    const { data: genericProfiles } = await supabase
      .from("generic_profiles")
      .select("categories(slug)")
      .eq("user_id", user!.id)
      .neq("status", "draft");
    const slugs = [...new Set((genericProfiles ?? []).map((p) => (p.categories as unknown as { slug: string } | null)?.slug).filter((s): s is string => !!s))];
    if (slugs.length === 1) {
      redirect({ href: `/categories/${slugs[0]}/dashboard`, locale });
    }
    redirect({ href: "/categories", locale });
    return;
  }

  if (matchProfile.moderation_status === "approved") {
    return (
      <AppShell active="nanny">
        {profile?.role === "parent" ? (
          <NannyResults targetMatchId={targetMatchId} />
        ) : (
          <FamilyResults targetMatchId={targetMatchId} />
        )}
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
