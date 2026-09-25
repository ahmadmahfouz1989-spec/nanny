"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import CriteriaChecklist from "./criteria-checklist";
import MatchActions from "@/components/matches/match-actions";
import ProfileRating from "@/components/matches/profile-rating";
import GovernorateSelect from "@/components/matches/governorate-select";
import CreateProfileIllustration from "@/components/illustrations/create-profile-illustration";
import Image from "next/image";
import AvatarIllustration from "@/components/illustrations/avatar-illustration";
import ReportButton from "@/components/matches/report-button";
import SaveProfileButton from "@/components/save-profile-button";
import type { CriterionResult } from "@/lib/matching/generic-engine";
import { DAYS } from "@/lib/validation/profile";
import { ui } from "@/lib/ui";
import { labelOr } from "@/lib/i18n-fallback";
import { LogoLoader } from "@/components/animated-logo";
import { useLiveMatches } from "@/components/matches/use-live-matches";
import { formatHoursRange } from "@/lib/format-hours";

type OtherProfile = {
  id: string;
  full_name: string;
  profile_photo_url: string | null;
  location_id: string | null;
  attributes: Record<string, unknown>;
  locations: { name_en: string; name_ar: string; name_fr: string } | null;
};

const TONES = ["primary", "secondary", "berry"] as const;

type GenericMatch = {
  id: string;
  score: number;
  score_breakdown: Record<string, CriterionResult>;
  status: string;
  interest_expires_at: string | null;
  other: OtherProfile;
  rating: { average: number | null; count: number };
  featured: boolean;
  isSaved: boolean;
};

// Featured profiles surface first regardless of match score -- a stable
// sort keeps the algorithm's score order intact within each group. Same
// pattern as nanny-results.tsx/family-results.tsx.
function sortedByFeatured(results: GenericMatch[] | null) {
  if (!results) return results;
  return [...results].sort((a, b) => Number(b.featured) - Number(a.featured));
}

function localizedLocationName(
  loc: { name_en: string; name_ar: string; name_fr: string } | null,
  locale: string,
) {
  if (!loc) return null;
  if (locale === "ar") return loc.name_ar;
  if (locale === "fr") return loc.name_fr;
  return loc.name_en;
}

export default function GenericResults({
  categorySlug,
  role,
  targetMatchId = null,
}: {
  categorySlug: string;
  // From a match notification (?match=...) -- see useLiveMatches.
  targetMatchId?: string | null;
  // Only needed when the account holds both a seeker and a provider
  // profile in this category -- otherwise the API resolves the single
  // profile on its own.
  role?: "seeker" | "provider";
}) {
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
  useLiveMatches({
    source: "generic",
    results,
    setResults,
    targetMatchId,
    fetchTarget: (matchId) => {
      const params = new URLSearchParams({ categorySlug, matchId });
      if (role) params.set("role", role);
      return fetch(`/api/generic-matches?${params}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((body) => body?.results?.[0] ?? null)
        .catch(() => null);
    },
  });
  const [error, setError] = useState<string | null>(null);
  const [governorateId, setGovernorateId] = useState("");
  const [day, setDay] = useState("");
  const [minYearsExperience, setMinYearsExperience] = useState("");

  useEffect(() => {
    const params = new URLSearchParams({ categorySlug });
    if (role) params.set("role", role);
    if (governorateId) params.set("governorateId", governorateId);
    if (day) params.set("day", day);
    if (minYearsExperience) params.set("minYearsExperience", minYearsExperience);

    fetch(`/api/generic-matches?${params}`)
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
  }, [categorySlug, role, t, governorateId, day, minYearsExperience]);

  // Minimum experience only makes sense filtering providers (a seeker has
  // no years-of-experience field), so only show it once we know the
  // viewer is a seeker looking at providers.
  const showExperienceFilter = myRole === "seeker";
  const hasFilters = !!(governorateId || day || (showExperienceFilter && minYearsExperience));
  function clearFilters() {
    setGovernorateId("");
    setDay("");
    setMinYearsExperience("");
  }

  return (
    <div className={`max-w-2xl w-full mx-auto px-6 py-8 ${!results && !error ? "min-h-screen flex flex-col" : ""}`}>
      <h1 className="font-display text-2xl font-bold mb-1">{t("titleMatches")}</h1>
      <p className="text-sm text-muted mb-4">{t("resultsSubtitle")}</p>

      <div className="flex flex-wrap items-center gap-2 mb-6 rounded-2xl border border-border bg-surface-sunken/50 p-3">
        <GovernorateSelect value={governorateId} onChange={setGovernorateId} placeholder={t("filterAllAreas")} />
        <select className={ui.select + " w-auto"} value={day} onChange={(e) => setDay(e.target.value)}>
          <option value="">{t("filterAnyDay")}</option>
          {DAYS.map((d) => (
            <option key={d} value={d}>
              {tDays(d)}
            </option>
          ))}
        </select>
        {showExperienceFilter && (
          <input
            type="number"
            min={0}
            className={ui.input + " w-auto"}
            placeholder={t("filterMinExperience")}
            value={minYearsExperience}
            onChange={(e) => setMinYearsExperience(e.target.value)}
          />
        )}
        {hasFilters && (
          <button type="button" onClick={clearFilters} className={ui.buttonGhost + " text-sm"}>
            {t("clearFilters")}
          </button>
        )}
      </div>

      {!results && !error && <LogoLoader label={t("loading")} fullHeight />}
      {error && <p className="text-sm text-muted">{error}</p>}
      {results && results.length === 0 && (
        <div className={ui.card + " overflow-hidden"}>
          <CreateProfileIllustration className="w-full h-32" />
          <p className="text-sm text-muted p-6">{hasFilters ? t("emptyFiltered") : t("empty")}</p>
        </div>
      )}

      <div className="flex flex-col gap-5">
        {sortedByFeatured(results)?.map((r, i, arr) => {
          const other = r.other;
          const a = other.attributes ?? {};
          const gov = localizedLocationName(other.locations, locale);
          const availability = a.availability as { days?: string[]; startTime?: string; endTime?: string } | undefined;
          const availableDays = (availability?.days ?? a.neededDays ?? []) as string[];
          const availableHours = formatHoursRange(availability?.startTime, availability?.endTime, locale);
          const specialties = ((a.careSpecialties ?? a.careSpecialtiesNeeded ?? []) as string[]) ?? [];
          const subjects = ((a.subjects ?? a.subjectsNeeded ?? []) as string[]) ?? [];
          const tone = TONES[i % TONES.length];
          const hasFeaturedSection = arr.some((x) => x.featured);
          const showFeaturedHeader = r.featured && i === 0;
          const showRegularHeader = !r.featured && hasFeaturedSection && (i === 0 || arr[i - 1].featured);

          return (
            <div key={r.id} className="flex flex-col gap-2">
              {showFeaturedHeader && (
                <p className={ui.eyebrow + " flex items-center gap-1.5"}>
                  <span className="text-accent-hover">★</span>
                  {t("featuredSection")}
                </p>
              )}
              {showRegularHeader && <p className={ui.eyebrow}>{t("allMatchesSection")}</p>}
              <div id={`match-${r.id}`} className={ui.cardHover + " oui-in overflow-hidden scroll-mt-6"}>
                <div className="relative">
                  {other.profile_photo_url ? (
                    <Image
                      src={other.profile_photo_url}
                      alt=""
                      width={640}
                      height={160}
                      unoptimized
                      className="h-28 w-full object-cover"
                    />
                  ) : (
                    <AvatarIllustration tone={tone} className="h-28 w-full" />
                  )}
                  {other.profile_photo_url && (
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-transparent" />
                  )}
                  {r.featured && (
                    <span className="absolute top-3 start-3 inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-ink shadow-sm">
                      <span aria-hidden>★</span>
                      {t("featuredBadge")}
                    </span>
                  )}
                  <span className={ui.badge(ui.scoreTone(r.score)) + " absolute top-3 end-3 bg-surface/90!"}>
                    {t("scoreLabel", { score: Math.round(r.score) })}
                  </span>
                  <SaveProfileButton
                    profileType="generic"
                    profileId={other.id}
                    initialSaved={r.isSaved}
                    className="absolute bottom-3 end-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-surface/90 text-ink shadow-sm transition hover:bg-surface"
                  />
                  <div className="absolute bottom-0 start-0 p-4">
                    <p className="font-display text-lg font-bold text-white drop-shadow">{other.full_name}</p>
                    {gov && <p className="text-xs text-white/90 drop-shadow">{gov}</p>}
                  </div>
                </div>

                <div className="p-5">
                  <div className="mb-3">
                    <ProfileRating
                      profileId={other.id}
                      profileType="generic"
                      average={r.rating?.average ?? null}
                      count={r.rating?.count ?? 0}
                    />
                  </div>

                  {availableDays.length > 0 && (
                    <div className="mb-3">
                      <div className="grid grid-cols-7 gap-1">
                        {DAYS.map((day) => (
                          <div key={day} className={ui.dayChip(availableDays.includes(day))}>
                            {tDays(day)}
                          </div>
                        ))}
                      </div>
                      {availableHours && <p className="text-xs text-muted mt-1.5">{availableHours}</p>}
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

                  <CriteriaChecklist breakdown={r.score_breakdown} />
                  {myRole && (
                    <MatchActions
                      source="generic"
                      matchId={r.id}
                      status={r.status}
                      interestExpiresAt={r.interest_expires_at}
                      viewerSide={myRole}
                    />
                  )}
                  <ReportButton profileId={other.id} profileType="generic" matchId={r.id} matchSource={categorySlug} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
