"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import ResultsShell from "@/components/matches/results-shell";
import CriteriaChecklist from "@/components/matches/criteria-checklist";
import MatchActions from "@/components/matches/match-actions";
import ReportButton from "@/components/matches/report-button";
import CreateProfileIllustration from "@/components/illustrations/create-profile-illustration";
import type { Criterion, CriterionResult } from "@/lib/matching/engine";
import { ui } from "@/lib/ui";

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
    salary_min: number;
    salary_max: number;
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
    <ResultsShell title={t("titleNanny")} backLabel={t("backToDashboard")}>
      {!results && !error && <p className="text-sm text-muted">{t("loading")}</p>}
      {error && <p className="text-sm text-muted">{error}</p>}
      {results && results.length === 0 && (
        <div className={ui.card + " overflow-hidden"}>
          <CreateProfileIllustration className="w-full h-32" />
          <p className="text-sm text-muted p-6">{t("empty")}</p>
        </div>
      )}

      <div className="flex flex-col gap-4">
        {results?.map((r) => {
          const parent = r.parent_profiles;
          const area = localizedLocationName(parent.locations, locale);
          const langs = (parent.parent_profile_languages ?? []).map((l) => localizedLangName(l.languages, locale));
          return (
            <div key={r.id} className={ui.card + " p-5"}>
              <div className="flex items-center justify-between gap-2 mb-1">
                <p className="font-display text-lg font-semibold truncate">{parent.full_name}</p>
                <span className={ui.badge(ui.scoreTone(r.score))}>{t("scoreLabel", { score: Math.round(r.score) })}</span>
              </div>
              <p className="text-sm text-muted mb-2">
                {area && `${area} · `}
                {t("children", { count: parent.num_children })} ·{" "}
                {t("salaryRange", { min: parent.salary_min, max: parent.salary_max })}
              </p>
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
          );
        })}
      </div>
    </ResultsShell>
  );
}
