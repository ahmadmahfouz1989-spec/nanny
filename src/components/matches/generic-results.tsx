"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import GenericCriteriaChecklist from "@/components/matches/generic-criteria-checklist";
import GenericMatchActions from "@/components/matches/generic-match-actions";
import ProfileRating from "@/components/matches/profile-rating";
import type { CriterionResult } from "@/lib/matching/generic-engine";
import { DAYS } from "@/lib/validation/profile";
import { ui } from "@/lib/ui";
import { labelOr } from "@/lib/i18n-fallback";
import { LogoLoader } from "@/components/animated-logo";

type OtherProfile = {
  id: string;
  full_name: string;
  location_id: string | null;
  attributes: Record<string, unknown>;
  locations: { name_en: string; name_ar: string; name_fr: string } | null;
};

type GenericMatch = {
  id: string;
  score: number;
  score_breakdown: Record<string, CriterionResult>;
  status: string;
  interest_expires_at: string | null;
  other: OtherProfile;
  rating: { average: number | null; count: number };
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

export default function GenericResults({ categorySlug }: { categorySlug: string }) {
  const t = useTranslations("Matches");
  const tCare = useTranslations("CareSpecialties");
  const tSubject = useTranslations("Subjects");
  const tGrade = useTranslations("GradeLevels");
  const tSchedule = useTranslations("ScheduleOptions");
  const tLiveArrangement = useTranslations("LiveArrangementOptions");
  const tFormat = useTranslations("TutoringFormats");
  const tDays = useTranslations("Days");
  const tPatientAge = useTranslations("PatientAgeGroups");
  const locale = useLocale();
  const [myRole, setMyRole] = useState<"seeker" | "provider" | null>(null);
  const [results, setResults] = useState<GenericMatch[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/generic-matches?categorySlug=${categorySlug}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) {
          setError(t("errorNoProfile"));
          return;
        }
        setMyRole(body.myRole);
        setResults(body.results);
      })
      .catch(() => setError(t("errorNoProfile")));
  }, [categorySlug, t]);

  return (
    <div className={`max-w-2xl w-full mx-auto px-6 py-8 ${!results && !error ? "min-h-screen flex flex-col" : ""}`}>
      <h1 className="font-display text-2xl font-bold mb-6">{t("titleMatches")}</h1>
      {!results && !error && <LogoLoader label={t("loading")} fullHeight />}
      {error && <p className="text-sm text-muted">{error}</p>}
      {results && results.length === 0 && (
        <div className={ui.card + " p-6"}>
          <p className="text-sm text-muted">{t("empty")}</p>
        </div>
      )}

      <div className="flex flex-col gap-5">
        {results?.map((r) => {
          const other = r.other;
          const a = other.attributes ?? {};
          const gov = localizedLocationName(other.locations, locale);
          const availableDays = ((a.availability as { days?: string[] } | undefined)?.days ?? a.neededDays ?? []) as string[];
          const specialties = ((a.careSpecialties ?? a.careSpecialtiesNeeded ?? []) as string[]) ?? [];
          const subjects = ((a.subjects ?? a.subjectsNeeded ?? []) as string[]) ?? [];

          return (
            <div key={r.id} id={`match-${r.id}`} className={ui.cardHover + " oui-in overflow-hidden scroll-mt-6 p-5"}>
              <div className="flex items-center justify-between mb-2">
                <p className="font-display text-lg font-bold">{other.full_name}</p>
                <span className={ui.badge(ui.scoreTone(r.score))}>{t("scoreLabel", { score: Math.round(r.score) })}</span>
              </div>
              <div className="mb-3">
                <ProfileRating
                  profileId={other.id}
                  profileType="generic"
                  average={r.rating?.average ?? null}
                  count={r.rating?.count ?? 0}
                />
              </div>
              {gov && <p className="text-sm text-muted mb-3">{gov}</p>}

              {availableDays.length > 0 && (
                <div className="mb-3">
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
                {typeof a.employmentType === "string" && (
                  <>
                    <dt className="text-muted">{t("criteriaEmploymentType")}</dt>
                    <dd>{tSchedule(a.employmentType as never)}</dd>
                  </>
                )}
                {typeof a.scheduleType === "string" && (
                  <>
                    <dt className="text-muted">{t("criteriaEmploymentType")}</dt>
                    <dd>{tSchedule(a.scheduleType as never)}</dd>
                  </>
                )}
                {typeof a.liveArrangementPref === "string" && (
                  <>
                    <dt className="text-muted">{t("criteriaLiveArrangement")}</dt>
                    <dd>{tLiveArrangement(a.liveArrangementPref as never)}</dd>
                  </>
                )}
                {typeof a.liveArrangement === "string" && (
                  <>
                    <dt className="text-muted">{t("criteriaLiveArrangement")}</dt>
                    <dd>{tLiveArrangement(a.liveArrangement as never)}</dd>
                  </>
                )}
                {typeof a.format === "string" && (
                  <>
                    <dt className="text-muted">{t("criteriaFormat")}</dt>
                    <dd>{tFormat(a.format as never)}</dd>
                  </>
                )}
                {typeof a.yearsExperience === "number" && (
                  <>
                    <dt className="text-muted">{t("yearsExperience", { years: a.yearsExperience })}</dt>
                    <dd></dd>
                  </>
                )}
                {typeof a.hasNursingDiploma === "boolean" && (
                  <>
                    <dt className="text-muted">{t("criteriaNursingDiploma")}</dt>
                    <dd>{a.hasNursingDiploma ? "Yes" : "No"}</dd>
                  </>
                )}
                {typeof a.patientAgeGroup === "string" && (
                  <>
                    <dt className="text-muted">{t("criteriaSpecialty")}</dt>
                    <dd>{tPatientAge(a.patientAgeGroup as never)}</dd>
                  </>
                )}
                {typeof a.gradeLevel === "string" && (
                  <>
                    <dt className="text-muted">{t("criteriaGradeLevel")}</dt>
                    <dd>{tGrade(a.gradeLevel as never)}</dd>
                  </>
                )}
                {Array.isArray(a.gradeLevels) && a.gradeLevels.length > 0 && (
                  <>
                    <dt className="text-muted">{t("criteriaGradeLevel")}</dt>
                    <dd>{(a.gradeLevels as string[]).map((g) => tGrade(g as never)).join(", ")}</dd>
                  </>
                )}
                {specialties.length > 0 && (
                  <>
                    <dt className="text-muted">{t("criteriaSpecialty")}</dt>
                    <dd>{specialties.map((s) => labelOr(tCare, s)).join(", ")}</dd>
                  </>
                )}
                {subjects.length > 0 && (
                  <>
                    <dt className="text-muted">{t("criteriaSubject")}</dt>
                    <dd>{subjects.map((s) => labelOr(tSubject, s)).join(", ")}</dd>
                  </>
                )}
              </dl>

              {a.shortIntro ? <p className="text-sm text-ink/80 mb-3">{String(a.shortIntro)}</p> : null}

              <GenericCriteriaChecklist breakdown={r.score_breakdown} />
              {myRole && (
                <GenericMatchActions
                  matchId={r.id}
                  status={r.status}
                  interestExpiresAt={r.interest_expires_at}
                  viewerSide={myRole}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
