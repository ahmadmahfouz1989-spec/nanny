"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import ResultsShell from "@/components/matches/results-shell";
import CriteriaChecklist from "@/components/matches/criteria-checklist";
import MatchActions from "@/components/matches/match-actions";
import ReportButton from "@/components/matches/report-button";
import CreateProfileIllustration from "@/components/illustrations/create-profile-illustration";
import type { Criterion, CriterionResult } from "@/lib/matching/engine";
import { ui } from "@/lib/ui";

type NannyResult = {
  id: string;
  score: number;
  score_breakdown: Record<Criterion, CriterionResult>;
  status: string;
  interest_expires_at: string | null;
  nanny_profiles: {
    id: string;
    full_name: string;
    profile_photo_url: string | null;
    work_radius_km: number;
    employment_type: string;
    live_arrangement_pref: string;
    years_experience: number;
    short_intro: string | null;
    locations: { name_en: string; name_ar: string; name_fr: string } | null;
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

export default function NannyResults() {
  const t = useTranslations("Matches");
  const locale = useLocale();
  const [results, setResults] = useState<NannyResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/search/nannies")
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
    <ResultsShell title={t("titleParent")} backLabel={t("backToDashboard")}>
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
          const nanny = r.nanny_profiles;
          const area = localizedLocationName(nanny.locations, locale);
          return (
            <div key={r.id} className={ui.card + " p-5 flex gap-4"}>
              {nanny.profile_photo_url ? (
                <Image
                  src={nanny.profile_photo_url}
                  alt=""
                  width={64}
                  height={64}
                  unoptimized
                  className="h-16 w-16 rounded-full object-cover shrink-0"
                />
              ) : (
                <div className="h-16 w-16 rounded-full bg-primary-soft shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p className="font-display text-lg font-semibold truncate">{nanny.full_name}</p>
                  <span className={ui.badge(ui.scoreTone(r.score))}>{t("scoreLabel", { score: Math.round(r.score) })}</span>
                </div>
                <p className="text-sm text-muted mb-2">
                  {area && `${area} · `}
                  {t("yearsExperience", { years: nanny.years_experience })}
                </p>
                {nanny.short_intro && <p className="text-sm text-ink/80 mb-3">{nanny.short_intro}</p>}
                <CriteriaChecklist breakdown={r.score_breakdown} />
                <MatchActions
                  matchId={r.id}
                  status={r.status}
                  interestExpiresAt={r.interest_expires_at}
                  viewerSide="parent"
                />
                <ReportButton profileId={nanny.id} profileType="nanny" />
              </div>
            </div>
          );
        })}
      </div>
    </ResultsShell>
  );
}
