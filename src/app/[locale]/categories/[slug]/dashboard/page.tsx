import { getTranslations } from "next-intl/server";
import { redirect, Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/app-shell";
import CreateProfileIllustration from "@/components/illustrations/create-profile-illustration";
import GenericResults from "@/components/matches/generic-results";
import { ui } from "@/lib/ui";

const MODERATION_BAND: Record<"success" | "warning" | "danger", string> = {
  success: "bg-success-soft",
  warning: "bg-warning-soft",
  danger: "bg-danger-soft",
};

export default async function CategoryDashboardPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const t = await getTranslations("Dashboard");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect({ href: "/login", locale });
  }

  const { data: category } = await supabase.from("categories").select("id, status").eq("slug", slug).maybeSingle();
  if (!category || category.status !== "live") {
    redirect({ href: "/categories", locale });
  }

  const { data: profiles } = await supabase
    .from("generic_profiles")
    .select("status, moderation_status")
    .eq("user_id", user!.id)
    .eq("category_id", category!.id);

  const myProfile = (profiles ?? [])[0] ?? null;

  if (myProfile?.moderation_status === "approved") {
    return (
      <AppShell active="nursing">
        <GenericResults categorySlug={slug} />
      </AppShell>
    );
  }

  const moderationTone = myProfile?.moderation_status === "rejected" ? "danger" : "warning";

  return (
    <AppShell active="nursing">
      <div className="max-w-lg w-full mx-auto px-6 py-8">
        <h1 className="font-display text-2xl font-bold mb-6">{t("title")}</h1>

        <div className={ui.card + " overflow-hidden"}>
          {myProfile ? (
            <>
              <div className={`flex items-center justify-between px-6 py-4 ${MODERATION_BAND[moderationTone]}`}>
                <p className="font-display text-lg font-bold">{t("yourProfile")}</p>
                <span className={ui.badge(moderationTone)}>
                  {myProfile.moderation_status === "pending" && t("statusPending")}
                  {myProfile.moderation_status === "rejected" && t("statusRejected")}
                </span>
              </div>
              <div className="p-6">
                <p className="text-sm text-muted">
                  {myProfile.moderation_status === "pending" && t("descriptionPending")}
                  {myProfile.moderation_status === "rejected" && t("descriptionRejected")}
                </p>
                <Link href={`/categories/${slug}/onboarding`} className={ui.link + " text-sm mt-3 inline-block"}>
                  {t("editProfileLink")}
                </Link>
              </div>
            </>
          ) : (
            <>
              <CreateProfileIllustration className="w-full h-36" />
              <div className="p-6">
                <p className="font-display text-lg font-semibold mb-1">{t("noProfileTitle")}</p>
                <p className="text-sm text-muted mb-4">{t("noProfileGeneric")}</p>
                <Link href={`/categories/${slug}/onboarding`} className={ui.buttonPrimary}>
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
