"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import CriteriaChecklist from "@/components/matches/criteria-checklist";
import MatchActions from "@/components/matches/match-actions";
import ReportButton from "@/components/matches/report-button";
import CreateProfileIllustration from "@/components/illustrations/create-profile-illustration";
import AvatarIllustration from "@/components/illustrations/avatar-illustration";
import type { Criterion, CriterionResult } from "@/lib/matching/engine";
import { DAYS } from "@/lib/validation/profile";
import { ui } from "@/lib/ui";

const TONES = ["primary", "secondary", "berry"] as const;

type LangRef = { languages: { id: string; name_en: string; name_ar: string; name_fr: string } };

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
    availability: { days: string[] };
    years_experience: number;
    has_transportation: boolean;
    can_drive: boolean;
    certifications: string[];
    short_intro: string | null;
    locations: { name_en: string; name_ar: string; name_fr: string } | null;
    nanny_profile_languages: LangRef[];
    nanny_experience: { age_group: string; years_experience: number }[];
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

export default function NannyResults() {
  const t = useTranslations("Matches");
  const tNanny = useTranslations("NannyOnboarding");
  const tAgeGroups = useTranslations("AgeGroups");
  const tDays = useTranslations("Days");
  const tCerts = useTranslations("Certifications");
  const tSchedule = useTranslations("ScheduleOptions");
  const tLiveArrangement = useTranslations("LiveArrangementOptions");
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
    <div className="max-w-2xl mx-auto w-full px-6 py-8">
      <h1 className="font-display text-2xl font-bold mb-6">{t("titleParent")}</h1>
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
          const nanny = r.nanny_profiles;
          const area = localizedLocationName(nanny.locations, locale);
          const langs = (nanny.nanny_profile_languages ?? []).map((l) => localizedLangName(l.languages, locale));
          const experience = nanny.nanny_experience ?? [];
          const tone = TONES[i % TONES.length];
          const availableDays = nanny.availability?.days ?? [];
          return (
            <div key={r.id} className={ui.card + " overflow-hidden"}>
              <div className="relative">
                {nanny.profile_photo_url ? (
                  <Image
                    src={nanny.profile_photo_url}
                    alt=""
                    width={640}
                    height={160}
                    unoptimized
                    className="h-28 w-full object-cover"
                  />
                ) : (
                  <AvatarIllustration tone={tone} className="h-28 w-full" />
                )}
                {nanny.profile_photo_url && (
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-transparent" />
                )}
                <span className={ui.badge(ui.scoreTone(r.score)) + " absolute top-3 end-3 bg-surface/90!"}>
                  {t("scoreLabel", { score: Math.round(r.score) })}
                </span>
                <div className="absolute bottom-0 start-0 p-4">
                  <p className="font-display text-lg font-bold text-white drop-shadow">{nanny.full_name}</p>
                  <p className="text-xs text-white/90 drop-shadow">
                    {area && `${area} · `}
                    {t("yearsExperience", { years: nanny.years_experience })}
                  </p>
                </div>
              </div>

              <div className="p-5">
                {nanny.short_intro && <p className="text-sm text-ink/80 mb-3">{nanny.short_intro}</p>}

                {availableDays.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-1.5">
                      {tNanny("availableDays")}
                    </p>
                    <div className="grid grid-cols-7 gap-1">
                      {DAYS.map((day) => (
                        <div key={day} className={ui.dayChip(availableDays.includes(day))}>
                          {tDays(day)}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm mb-3">
                  <dt className="text-muted">{tNanny("employmentType")}</dt>
                  <dd>{tSchedule(nanny.employment_type as never)}</dd>
                  <dt className="text-muted">{tNanny("liveArrangementPref")}</dt>
                  <dd>{tLiveArrangement(nanny.live_arrangement_pref as never)}</dd>
                  <dt className="text-muted">{tNanny("languages")}</dt>
                  <dd>{langs.join(", ") || "—"}</dd>
                  <dt className="text-muted">{tNanny("hasTransportation")}</dt>
                  <dd>{nanny.has_transportation ? "Yes" : "No"}</dd>
                  <dt className="text-muted">{tNanny("canDrive")}</dt>
                  <dd>{nanny.can_drive ? "Yes" : "No"}</dd>
                  {experience.length > 0 && (
                    <>
                      <dt className="text-muted">{tNanny("experienceByAge")}</dt>
                      <dd>
                        {experience
                          .map((e) => `${tAgeGroups(e.age_group as never)} (${e.years_experience})`)
                          .join(", ")}
                      </dd>
                    </>
                  )}
                  {(nanny.certifications?.length ?? 0) > 0 && (
                    <>
                      <dt className="text-muted">{tNanny("certifications")}</dt>
                      <dd>{nanny.certifications.map((c) => tCerts(c as never)).join(", ")}</dd>
                    </>
                  )}
                </dl>

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
    </div>
  );
}
