"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import CriteriaChecklist from "@/components/matches/criteria-checklist";
import MatchActions from "@/components/matches/match-actions";
import ReportButton from "@/components/matches/report-button";
import CreateProfileIllustration from "@/components/illustrations/create-profile-illustration";
import AvatarIllustration from "@/components/illustrations/avatar-illustration";
import type { Criterion, CriterionResult } from "@/lib/matching/engine";
import { ui } from "@/lib/ui";

const TONES = ["primary", "secondary", "berry"] as const;

type LangRef = { languages: { id: string; name_en: string; name_ar: string; name_fr: string } };

type FamilyResult = {
  id: string;
  score: number;
  score_breakdown: Record<Criterion, CriterionResult>;
  status: string;
  interest_expires_at: string | null;
  parent_profiles: {
    id: string;
    full_name: string;
    num_children: number;
    children_age_ranges: string[];
    schedule_type: string;
    live_arrangement: string;
    desired_start_date: string;
    transportation_required: boolean;
    additional_duties: string[];
    family_description: string | null;
    locations: { name_en: string; name_ar: string; name_fr: string } | null;
    parent_profile_languages: LangRef[];
  };
};

function localizedLocationName(
  loc: { name_en: string; name_ar: string; name_fr: string } | null,
  locale: string,
) {
  if (!loc) return null;
  if (locale === "ar") return loc.name_ar;
  if (locale === "fr") return loc.name_fr;
  return loc.name_en;
}

function localizedLangName(l: LangRef["languages"], locale: string) {
  if (locale === "ar") return l.name_ar;
  if (locale === "fr") return l.name_fr;
  return l.name_en;
}

export default function FamilyResults() {
  const t = useTranslations("Matches");
  const tParent = useTranslations("ParentOnboarding");
  const tAgeGroups = useTranslations("AgeGroups");
  const tDuties = useTranslations("Duties");
  const tSchedule = useTranslations("ScheduleOptions");
  const tLiveArrangement = useTranslations("LiveArrangementOptions");
  const locale = useLocale();
  const [results, setResults] = useState<FamilyResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/search/families")
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) {
          setError(t("errorNoProfile"));
          return;
        }
        setResults(body.results);
      })
      .catch(() => setError(t("errorNoProfile")));
  }, [t]);

  return (
    <div className="max-w-2xl mx-auto w-full px-6 py-8">
      <h1 className="font-display text-2xl font-bold mb-6">{t("titleNanny")}</h1>
      {!results && !error && <p className="text-sm text-muted">{t("loading")}</p>}
      {error && <p className="text-sm text-muted">{error}</p>}
      {results && results.length === 0 && (
        <div className={ui.card + " overflow-hidden"}>
          <CreateProfileIllustration className="w-full h-32" />
          <p className="text-sm text-muted p-6">{t("empty")}</p>
        </div>
      )}

      <div className="flex flex-col gap-5">
        {results?.map((r, i) => {
          const parent = r.parent_profiles;
          const area = localizedLocationName(parent.locations, locale);
          const langs = (parent.parent_profile_languages ?? []).map((l) => localizedLangName(l.languages, locale));
          const tone = TONES[i % TONES.length];
          return (
            <div key={r.id} className={ui.card + " overflow-hidden"}>
              <div className="relative">
                <AvatarIllustration tone={tone} className="h-28 w-full" />
                <span className={ui.badge(ui.scoreTone(r.score)) + " absolute top-3 end-3 bg-surface/90!"}>
                  {t("scoreLabel", { score: Math.round(r.score) })}
                </span>
                <div className="absolute bottom-0 start-0 p-4">
                  <p className="font-display text-lg font-bold text-white drop-shadow">{parent.full_name}</p>
                  <p className="text-xs text-white/90 drop-shadow">
                    {area && `${area} · `}
                    {t("children", { count: parent.num_children })}
                  </p>
                </div>
              </div>

              <div className="p-5">
                {parent.family_description && (
                  <p className="text-sm text-ink/80 mb-3">{parent.family_description}</p>
                )}

                <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm mb-3">
                  <dt className="text-muted">{tParent("ageRanges")}</dt>
                  <dd>{parent.children_age_ranges.map((g) => tAgeGroups(g as never)).join(", ")}</dd>
                  <dt className="text-muted">{tParent("schedule")}</dt>
                  <dd>{tSchedule(parent.schedule_type as never)}</dd>
                  <dt className="text-muted">{tParent("liveArrangement")}</dt>
                  <dd>{tLiveArrangement(parent.live_arrangement as never)}</dd>
                  <dt className="text-muted">{tParent("desiredStartDate")}</dt>
                  <dd>{parent.desired_start_date}</dd>
                  <dt className="text-muted">{tParent("preferredLanguages")}</dt>
                  <dd>{langs.join(", ") || "—"}</dd>
                  <dt className="text-muted">{tParent("transportationRequired")}</dt>
                  <dd>{parent.transportation_required ? "Yes" : "No"}</dd>
                  {parent.additional_duties.length > 0 && (
                    <>
                      <dt className="text-muted">{tParent("additionalDuties")}</dt>
                      <dd>{parent.additional_duties.map((d) => tDuties(d as never)).join(", ")}</dd>
                    </>
                  )}
                </dl>

                <CriteriaChecklist breakdown={r.score_breakdown} />
                <MatchActions
                  matchId={r.id}
                  status={r.status}
                  interestExpiresAt={r.interest_expires_at}
                  viewerSide="nanny"
                />
                <ReportButton profileId={parent.id} profileType="parent" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
