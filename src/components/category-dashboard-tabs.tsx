"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import GenericResults from "@/components/matches/generic-results";
import { ui } from "@/lib/ui";
import { MATCH_TARGET_EVENT, type MatchTargetDetail } from "@/lib/match-target";

const MODERATION_BAND: Record<"warning" | "danger", string> = {
  warning: "bg-warning-soft",
  danger: "bg-danger-soft",
};

type ProfileSummary = { role: "seeker" | "provider"; moderationStatus: string };

/**
 * The schema allows one seeker AND one provider profile per user per
 * category (someone who tutors and also seeks a tutor for their own kid),
 * but there's only ever one dashboard route per category -- this switches
 * between the two, mirroring the pattern used on the account-wide
 * /profile page for the analogous multi-category case.
 */
export default function CategoryDashboardTabs({
  categorySlug,
  profiles,
  targetMatchId = null,
  targetRole = null,
}: {
  categorySlug: string;
  profiles: ProfileSummary[];
  // From a match notification: the match to land on, and which of this
  // account's two profiles it belongs to (resolved server-side).
  targetMatchId?: string | null;
  targetRole?: "seeker" | "provider" | null;
}) {
  const t = useTranslations("Dashboard");
  const [activeRole, setActiveRole] = useState(targetRole ?? profiles[0]!.role);

  // A notification clicked while already here only changes these props on
  // the same mounted component -- follow it to the right tab (adjusting
  // state during render, React's recommended alternative to an effect).
  const [seenTarget, setSeenTarget] = useState(targetMatchId);
  if (targetMatchId !== seenTarget) {
    setSeenTarget(targetMatchId);
    if (targetRole) setActiveRole(targetRole);
  }

  // Same notification clicked again (identical URL, no prop change) after
  // manually switching tabs -- switch back to the match's tab.
  useEffect(() => {
    function onTarget(e: Event) {
      if (targetRole && (e as CustomEvent<MatchTargetDetail>).detail.matchId === targetMatchId) setActiveRole(targetRole);
    }
    window.addEventListener(MATCH_TARGET_EVENT, onTarget);
    return () => window.removeEventListener(MATCH_TARGET_EVENT, onTarget);
  }, [targetMatchId, targetRole]);
  const active = profiles.find((p) => p.role === activeRole) ?? profiles[0]!;

  const tabBar = (
    <div className="flex items-center gap-1 rounded-xl bg-surface-sunken p-1 mb-4">
      {profiles.map((p) => (
        <button
          key={p.role}
          type="button"
          onClick={() => setActiveRole(p.role)}
          className={ui.toggleTab(p.role === active.role)}
        >
          {p.role === "provider" ? t("roleProvider") : t("roleSeeker")}
        </button>
      ))}
    </div>
  );

  // Approved renders GenericResults, which already supplies its own full
  // max-width/padding wrapper -- the tab bar gets a matching one of its
  // own just above it, rather than double-nesting the two.
  if (active.moderationStatus === "approved") {
    return (
      <>
        <div className="max-w-2xl w-full mx-auto px-6 pt-8">{tabBar}</div>
        {/* Keyed by role: GenericResults owns its own filter state
            (governorate/day/minYearsExperience), and switching tabs must
            reset all of it, not carry it into the other role's search --
            a stale minYearsExperience in particular silently hid every
            seeker result once applied to a provider search, which has no
            such field. */}
        <GenericResults
          key={active.role}
          categorySlug={categorySlug}
          role={active.role}
          targetMatchId={active.role === targetRole ? targetMatchId : null}
        />
      </>
    );
  }

  return (
    <div className="max-w-lg w-full mx-auto px-6 py-8">
      {tabBar}
      <div className={ui.card + " overflow-hidden"}>
        <div
          className={`flex items-center justify-between px-6 py-4 ${
            MODERATION_BAND[active.moderationStatus === "rejected" ? "danger" : "warning"]
          }`}
        >
          <p className="font-display text-lg font-bold">{t("yourProfile")}</p>
          <span className={ui.badge(active.moderationStatus === "rejected" ? "danger" : "warning")}>
            {active.moderationStatus === "pending" && t("statusPending")}
            {active.moderationStatus === "rejected" && t("statusRejected")}
          </span>
        </div>
        <div className="p-6">
          <p className="text-sm text-muted">
            {active.moderationStatus === "pending" && t("descriptionPending")}
            {active.moderationStatus === "rejected" && t("descriptionRejected")}
          </p>
          <Link
            href={`/categories/${categorySlug}/onboarding?role=${active.role}`}
            className={ui.link + " text-sm mt-3 inline-block"}
          >
            {t("editProfileLink")}
          </Link>
        </div>
      </div>
    </div>
  );
}
