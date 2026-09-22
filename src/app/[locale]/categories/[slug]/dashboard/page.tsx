import { getTranslations } from "next-intl/server";
import { redirect, Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/app-shell";
import GenericResults from "@/components/matches/generic-results";
import CategoryDashboardTabs from "@/components/category-dashboard-tabs";
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
    .select("role, status, moderation_status")
    .eq("user_id", user!.id)
    .eq("category_id", category!.id);

  // A draft is just a claimed role with nothing filled in yet (see
  // /api/generic-profile/claim) -- treat it the same as no profile at all,
  // not as something actually submitted and awaiting review.
  const myProfiles = (profiles ?? []).filter((p) => p.status !== "draft");

  // Nothing real submitted yet (no row at all, or only an abandoned draft)
  // -- straight to the role picker rather than a "no profile yet, click
  // here" dead end. The picker itself decides whether to show both
  // options again or resume the draft's form.
  if (myProfiles.length === 0) {
    redirect({ href: `/categories/${slug}/onboarding`, locale });
    return;
  }

  // The schema allows one seeker AND one provider profile per user per
  // category -- when both are real (non-draft), there's no single
  // "myProfile" to pick, so switch between them instead of arbitrarily
  // only ever showing whichever one the query happened to return first.
  if (myProfiles.length > 1) {
    return (
      <AppShell active={slug as "nursing" | "tutoring"}>
        <CategoryDashboardTabs
          categorySlug={slug}
          profiles={myProfiles.map((p) => ({ role: p.role as "seeker" | "provider", moderationStatus: p.moderation_status }))}
        />
      </AppShell>
    );
  }

  const myProfile = myProfiles[0]!;

  if (myProfile.moderation_status === "approved") {
    return (
      <AppShell active={slug as "nursing" | "tutoring"}>
        <GenericResults categorySlug={slug} role={myProfile.role as "seeker" | "provider"} />
      </AppShell>
    );
  }

  const moderationTone = myProfile.moderation_status === "rejected" ? "danger" : "warning";

  return (
    <AppShell active={slug as "nursing" | "tutoring"}>
      <div className="max-w-lg w-full mx-auto px-6 py-8">
        <h1 className="font-display text-2xl font-bold mb-6">{t("title")}</h1>

        <div className={ui.card + " overflow-hidden"}>
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
        </div>
      </div>
    </AppShell>
  );
}
