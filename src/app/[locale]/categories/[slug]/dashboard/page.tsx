import { getTranslations } from "next-intl/server";
import { redirect, Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/app-shell";
import GenericResults from "@/components/matches/generic-results";
import CategoryDashboardTabs from "@/components/category-dashboard-tabs";
import { ui } from "@/lib/ui";
import { isCategorySlug } from "@/lib/category-slugs";

const MODERATION_BAND: Record<"success" | "warning" | "danger", string> = {
  success: "bg-success-soft",
  warning: "bg-warning-soft",
  danger: "bg-danger-soft",
};

export default async function CategoryDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ match?: string }>;
}) {
  const { locale, slug } = await params;
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

  const { data: category } = await supabase.from("categories").select("id, status").eq("slug", slug).maybeSingle();
  if (!category || category.status !== "live" || !isCategorySlug(slug)) {
    redirect({ href: "/categories", locale });
    return;
  }

  const { data: profiles } = await supabase
    .from("generic_profiles")
    .select("id, role, status, moderation_status, profile_photo_url")
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
    // Which of the two profiles the notified match belongs to, so the right
    // tab opens instead of whichever role happens to be listed first.
    // generic_matches_select only returns the caller's own matches.
    let targetRole: "seeker" | "provider" | null = null;
    if (targetMatchId) {
      const { data: match } = await supabase
        .from("generic_matches")
        .select("seeker_profile_id, provider_profile_id")
        .eq("id", targetMatchId)
        .maybeSingle();
      const mine = myProfiles.find((p) => p.id === match?.seeker_profile_id || p.id === match?.provider_profile_id);
      targetRole = (mine?.role as "seeker" | "provider" | undefined) ?? null;
    }

    return (
      <AppShell active={slug}>
        <CategoryDashboardTabs
          categorySlug={slug}
          profiles={myProfiles.map((p) => ({ role: p.role as "seeker" | "provider", moderationStatus: p.moderation_status }))}
          targetMatchId={targetMatchId}
          targetRole={targetRole}
        />
      </AppShell>
    );
  }

  const myProfile = myProfiles[0]!;

  if (myProfile.moderation_status === "approved") {
    return (
      <AppShell active={slug}>
        <GenericResults
          categorySlug={slug}
          role={myProfile.role as "seeker" | "provider"}
          targetMatchId={targetMatchId}
        />
      </AppShell>
    );
  }

  const rejected = myProfile.moderation_status === "rejected";
  const moderationTone = rejected ? "danger" : "warning";
  const editHref = `/categories/${slug}/onboarding?role=${myProfile.role}`;

  // The reviewer's reason travels on the rejection notification (see the
  // moderation route) -- show the latest one for this category.
  let rejectionNote: string | null = null;
  if (rejected) {
    const { data: note } = await supabase
      .from("notifications")
      .select("payload")
      .eq("user_id", user!.id)
      .eq("type", "profile_rejected")
      .eq("payload->>category_slug", slug)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const notes = (note?.payload as { notes?: unknown } | null)?.notes;
    rejectionNote = typeof notes === "string" && notes.trim() ? notes : null;
  }

  // Where the profile is: submitted -> under review -> live.
  const steps = [
    { label: t("stepSubmitted"), state: "done" },
    { label: rejected ? t("stepNeedsChanges") : t("stepInReview"), state: rejected ? "problem" : "current" },
    { label: t("stepLive"), state: "todo" },
  ] as const;

  return (
    <AppShell active={slug}>
      <div className="max-w-lg w-full mx-auto px-6 py-8">
        <h1 className="font-display text-2xl font-bold mb-6">{t("title")}</h1>

        <div className={ui.card + " overflow-hidden"}>
          <div className={`flex items-center justify-between px-6 py-4 ${MODERATION_BAND[moderationTone]}`}>
            <p className="font-display text-lg font-bold">{t("yourProfile")}</p>
            <span className={ui.badge(moderationTone)}>{rejected ? t("statusRejected") : t("statusPending")}</span>
          </div>
          <div className="flex flex-col gap-5 p-6">
            <ol className="flex items-start">
              {steps.map((step, i) => (
                <li key={step.label} className="flex flex-1 flex-col items-center gap-1.5 text-center">
                  <span
                    className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                      step.state === "done"
                        ? "bg-success text-white"
                        : step.state === "current"
                          ? "bg-warning text-white"
                          : step.state === "problem"
                            ? "bg-danger text-white"
                            : "bg-surface-sunken text-muted"
                    }`}
                  >
                    {step.state === "done" ? "✓" : i + 1}
                  </span>
                  <span className={`text-xs ${step.state === "todo" ? "text-muted" : "font-semibold text-ink"}`}>{step.label}</span>
                </li>
              ))}
            </ol>

            <p className="text-sm text-ink/80">{rejected ? t("descriptionRejected") : t("descriptionPendingNext")}</p>

            {rejectionNote && (
              <div className="rounded-xl bg-danger-soft px-4 py-3 text-sm">
                <p className="font-semibold text-danger">{t("rejectionReason")}</p>
                <p dir="auto" className="mt-0.5 text-ink/80">{rejectionNote}</p>
              </div>
            )}

            {!rejected && !myProfile.profile_photo_url && (
              <div className="rounded-xl bg-primary-soft/50 px-4 py-3 text-sm">
                <p className="font-semibold">{t("addPhotoTitle")}</p>
                <p className="mt-0.5 text-ink/80">{t("addPhotoBody")}</p>
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              <Link href={editHref} className={ui.buttonPrimary}>
                {rejected ? t("editAndResubmit") : !myProfile.profile_photo_url ? t("addPhotoAction") : t("editProfile")}
              </Link>
              {!rejected && (
                <Link href="/feed" className={ui.buttonSecondary}>
                  {t("browseFeed")}
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
