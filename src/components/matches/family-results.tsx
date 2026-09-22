"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import CriteriaChecklist from "@/components/matches/criteria-checklist";
import MatchActions from "@/components/matches/match-actions";
import ReportButton from "@/components/matches/report-button";
import ProfileRating from "@/components/matches/profile-rating";
import GovernorateSelect from "@/components/matches/governorate-select";
import CreateProfileIllustration from "@/components/illustrations/create-profile-illustration";
import AvatarIllustration from "@/components/illustrations/avatar-illustration";
import type { Criterion, CriterionResult } from "@/lib/matching/engine";
import { DAYS } from "@/lib/validation/profile";
import { ui } from "@/lib/ui";
import { useHashScroll } from "@/components/matches/use-hash-scroll";
import { LogoLoader } from "@/components/animated-logo";

const TONES = ["primary", "secondary", "berry"] as const;

type LangRef = { languages: { id: string; name_en: string; name_ar: string; name_fr: string } };

type FamilyResult = {
  id: string;
  score: number;
  score_breakdown: Record<Criterion, CriterionResult>;
  status: string;
  interest_expires_at: string | null;
  rating: { average: number | null; count: number };
  featured: boolean;
  parent_profiles: {
    id: string;
    full_name: string;
    profile_photo_url: string | null;
    num_children: number;
    children_age_ranges: string[];
    schedule_type: string;
    live_arrangement: string;
    desired_start_date: string;
    transportation_required: boolean;
    additional_duties: string[];
    family_description: string | null;
    location_detail: string | null;
    nationality: string | null;
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

const PAGE_SIZE = 20;

export default function FamilyResults() {
  const t = useTranslations("Matches");
  const tParent = useTranslations("ParentOnboarding");
  const tAgeGroups = useTranslations("AgeGroups");
  const tDuties = useTranslations("Duties");
  const tDays = useTranslations("Days");
  const tSchedule = useTranslations("ScheduleOptions");
  const tLiveArrangement = useTranslations("LiveArrangementOptions");
  const tNat = useTranslations("Nationality");
  const locale = useLocale();
  const [results, setResults] = useState<FamilyResult[] | null>(null);
  useHashScroll(!!results);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [governorateId, setGovernorateId] = useState("");
  const [day, setDay] = useState("");
  const [scheduleType, setScheduleType] = useState("");
  const [liveArrangement, setLiveArrangement] = useState("");

  useEffect(() => {
    const params = new URLSearchParams();
    if (governorateId) params.set("governorateId", governorateId);
    if (day) params.set("day", day);
    if (scheduleType) params.set("scheduleType", scheduleType);
    if (liveArrangement) params.set("liveArrangement", liveArrangement);

    fetch(`/api/search/families?${params}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) {
          setError(t("errorNoProfile"));
          return;
        }
        setResults(body.results);
        setTotal(body.total);
      })
      .catch(() => setError(t("errorNoProfile")));
  }, [t, governorateId, day, scheduleType, liveArrangement]);

  function loadMore() {
    if (!results) return;
    setLoadingMore(true);
    const params = new URLSearchParams();
    if (governorateId) params.set("governorateId", governorateId);
    if (day) params.set("day", day);
    if (scheduleType) params.set("scheduleType", scheduleType);
    if (liveArrangement) params.set("liveArrangement", liveArrangement);
    params.set("page", String(Math.floor(results.length / PAGE_SIZE) + 1));

    fetch(`/api/search/families?${params}`)
      .then(async (res) => {
        const body = await res.json();
        setLoadingMore(false);
        if (!res.ok) return;
        setResults((prev) => [...(prev ?? []), ...body.results]);
        setTotal(body.total);
      })
      .catch(() => setLoadingMore(false));
  }

  const hasFilters = !!(governorateId || day || scheduleType || liveArrangement);
  function clearFilters() {
    setGovernorateId("");
    setDay("");
    setScheduleType("");
    setLiveArrangement("");
  }

  return (
    <div className={`max-w-2xl w-full mx-auto px-6 py-8 ${!results && !error ? "min-h-screen flex flex-col" : ""}`}>
      <h1 className="font-display text-2xl font-bold mb-1">{t("titleNanny")}</h1>
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
        <select className={ui.select + " w-auto"} value={scheduleType} onChange={(e) => setScheduleType(e.target.value)}>
          <option value="">{t("filterAnySchedule")}</option>
          <option value="full_time">{tSchedule("full_time")}</option>
          <option value="part_time">{tSchedule("part_time")}</option>
          <option value="either">{tSchedule("either")}</option>
        </select>
        <select className={ui.select + " w-auto"} value={liveArrangement} onChange={(e) => setLiveArrangement(e.target.value)}>
          <option value="">{t("filterAnyLiveArrangement")}</option>
          <option value="live_in">{tLiveArrangement("live_in")}</option>
          <option value="live_out">{tLiveArrangement("live_out")}</option>
          <option value="either">{tLiveArrangement("either")}</option>
        </select>
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
        {results?.map((r, i, arr) => {
          const parent = r.parent_profiles;
          const gov = localizedLocationName(parent.locations, locale);
          const area = [gov, parent.location_detail].filter(Boolean).join(", ");
          const langs = (parent.parent_profile_languages ?? []).map((l) => localizedLangName(l.languages, locale));
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
              <div
                id={`match-${r.id}`}
                className={ui.cardHover + " oui-in overflow-hidden scroll-mt-6"}
                style={{ animationDelay: `${Math.min(i, 8) * 0.05}s` }}
              >
                <div className="relative">
                  {parent.profile_photo_url ? (
                    <Image
                      src={parent.profile_photo_url}
                      alt=""
                      width={640}
                      height={160}
                      unoptimized
                      className="h-28 w-full object-cover"
                    />
                  ) : (
                    <AvatarIllustration tone={tone} className="h-28 w-full" />
                  )}
                  {parent.profile_photo_url && (
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
                  <div className="absolute bottom-0 start-0 p-4">
                    <p className="font-display text-lg font-bold text-white drop-shadow">{parent.full_name}</p>
                    <p className="text-xs text-white/90 drop-shadow">
                      {area && `${area} · `}
                      {t("children", { count: parent.num_children })}
                    </p>
                  </div>
              </div>

              <div className="p-5">
                <div className="mb-3">
                  <ProfileRating
                    profileId={parent.id}
                    profileType="parent"
                    average={r.rating?.average ?? null}
                    count={r.rating?.count ?? 0}
                  />
                </div>
                {parent.family_description && (
                  <p className="text-sm text-ink/80 mb-3">{parent.family_description}</p>
                )}

                <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm mb-3">
                  {parent.nationality && (
                    <>
                      <dt className="text-muted">{tNat("label")}</dt>
                      <dd>{tNat(parent.nationality as never)}</dd>
                    </>
                  )}
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
                <ReportButton profileId={parent.id} profileType="parent" matchId={r.id} matchSource="nanny" />
              </div>
              </div>
            </div>
          );
        })}
      </div>

      {results && results.length > 0 && results.length < total && (
        <button
          type="button"
          onClick={loadMore}
          disabled={loadingMore}
          className={ui.buttonGhost + " mt-6 w-full"}
        >
          {loadingMore ? t("loadingMore") : t("loadMore")}
        </button>
      )}
    </div>
  );
}
