"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import ProfileRating from "@/components/matches/profile-rating";
import ReportButton from "@/components/matches/report-button";
import AvatarIllustration from "@/components/illustrations/avatar-illustration";
import { labelOr } from "@/lib/i18n-fallback";

type LangRef = { languages: { id: string; name_en: string; name_ar: string; name_fr: string } };
type LocationRef = { name_en: string; name_ar: string; name_fr: string } | null;

type NannyProfile = {
  id: string;
  full_name: string;
  profile_photo_url: string | null;
  location_detail: string | null;
  nationality: string | null;
  employment_type: string;
  live_arrangement_pref: string;
  years_experience: number;
  has_transportation: boolean;
  can_drive: boolean;
  certifications: string[];
  short_intro: string | null;
  locations: LocationRef;
  nanny_profile_languages: LangRef[];
  nanny_experience: { age_group: string; years_experience: number }[];
};

type ParentProfile = {
  id: string;
  full_name: string;
  location_detail: string | null;
  nationality: string | null;
  num_children: number;
  children_age_ranges: string[];
  schedule_type: string;
  live_arrangement: string;
  transportation_required: boolean;
  additional_duties: string[];
  family_description: string | null;
  locations: LocationRef;
  parent_profile_languages: LangRef[];
};

type Response =
  | { type: "nanny"; profile: NannyProfile; rating: { average: number | null; count: number }; featured: boolean }
  | { type: "parent"; profile: ParentProfile; rating: { average: number | null; count: number }; featured: boolean };

function localizedLocationName(loc: LocationRef, locale: string) {
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

/**
 * Compact read-only profile view opened by clicking a name outside the
 * scored-match context (currently: the feed). Same content a match card
 * would show minus the score/criteria/connect actions, which only make
 * sense next to an actual match.
 */
export default function ProfileSummaryPanel({ profileType, profileId }: { profileType: "parent" | "nanny"; profileId: string }) {
  const t = useTranslations("Feed");
  const tNanny = useTranslations("NannyOnboarding");
  const tParent = useTranslations("ParentOnboarding");
  const tNat = useTranslations("Nationality");
  const tAgeGroups = useTranslations("AgeGroups");
  const tDuties = useTranslations("Duties");
  const tCerts = useTranslations("Certifications");
  const tSchedule = useTranslations("ScheduleOptions");
  const tLiveArrangement = useTranslations("LiveArrangementOptions");
  const locale = useLocale();

  const [data, setData] = useState<Response | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`/api/profiles/${profileType}/${profileId}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("failed"))))
      .then((body: Response) => {
        if (active) setData(body);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [profileType, profileId]);

  if (failed) return <p className="mt-2 text-xs text-danger">{t("profileError")}</p>;
  if (!data) return <p className="mt-2 text-xs text-muted">{t("loading")}</p>;

  const area = localizedLocationName(data.profile.locations, locale);
  const langs =
    data.type === "nanny"
      ? data.profile.nanny_profile_languages.map((l) => localizedLangName(l.languages, locale))
      : data.profile.parent_profile_languages.map((l) => localizedLangName(l.languages, locale));

  return (
    <div className="mt-2 rounded-xl border border-border bg-background p-4 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        {data.type === "nanny" && data.profile.profile_photo_url ? (
          <Image
            src={data.profile.profile_photo_url}
            alt=""
            width={48}
            height={48}
            className="h-12 w-12 rounded-full object-cover shrink-0"
          />
        ) : (
          <AvatarIllustration tone="primary" className="h-12 w-12 rounded-full overflow-hidden shrink-0" />
        )}
        <div className="min-w-0">
          <p className="font-display font-semibold text-ink truncate">{data.profile.full_name}</p>
          <p className="text-xs text-muted truncate">
            {area}
            {data.profile.location_detail ? ` · ${data.profile.location_detail}` : ""}
          </p>
        </div>
        {data.featured && <span className="ms-auto shrink-0 text-xs font-semibold text-berry">★ {t("featuredBadge")}</span>}
      </div>

      <ProfileRating profileId={data.profile.id} profileType={data.type} average={data.rating.average} count={data.rating.count} />

      {data.type === "nanny" ? (
        <>
          {data.profile.short_intro && <p className="text-sm text-ink/80">{data.profile.short_intro}</p>}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
            {data.profile.nationality && (
              <>
                <dt className="text-muted">{tNat("label")}</dt>
                <dd>{tNat(data.profile.nationality as never)}</dd>
              </>
            )}
            <dt className="text-muted">{tNanny("employmentType")}</dt>
            <dd>{tSchedule(data.profile.employment_type as never)}</dd>
            <dt className="text-muted">{tNanny("liveArrangementPref")}</dt>
            <dd>{tLiveArrangement(data.profile.live_arrangement_pref as never)}</dd>
            <dt className="text-muted">{tNanny("languages")}</dt>
            <dd>{langs.join(", ") || "—"}</dd>
            {data.profile.nanny_experience.length > 0 && (
              <>
                <dt className="text-muted">{tNanny("experienceByAge")}</dt>
                <dd>
                  {data.profile.nanny_experience
                    .map((e) => `${tAgeGroups(e.age_group as never)} (${e.years_experience})`)
                    .join(", ")}
                </dd>
              </>
            )}
            {data.profile.certifications.length > 0 && (
              <>
                <dt className="text-muted">{tNanny("certifications")}</dt>
                <dd>{data.profile.certifications.map((c) => labelOr(tCerts, c)).join(", ")}</dd>
              </>
            )}
          </dl>
        </>
      ) : (
        <>
          {data.profile.family_description && <p className="text-sm text-ink/80">{data.profile.family_description}</p>}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
            {data.profile.nationality && (
              <>
                <dt className="text-muted">{tNat("label")}</dt>
                <dd>{tNat(data.profile.nationality as never)}</dd>
              </>
            )}
            <dt className="text-muted">{tParent("ageRanges")}</dt>
            <dd>{data.profile.children_age_ranges.map((g) => tAgeGroups(g as never)).join(", ")}</dd>
            <dt className="text-muted">{tParent("schedule")}</dt>
            <dd>{tSchedule(data.profile.schedule_type as never)}</dd>
            <dt className="text-muted">{tParent("liveArrangement")}</dt>
            <dd>{tLiveArrangement(data.profile.live_arrangement as never)}</dd>
            <dt className="text-muted">{tParent("preferredLanguages")}</dt>
            <dd>{langs.join(", ") || "—"}</dd>
            {data.profile.additional_duties.length > 0 && (
              <>
                <dt className="text-muted">{tParent("additionalDuties")}</dt>
                <dd>{data.profile.additional_duties.map((d) => tDuties(d as never)).join(", ")}</dd>
              </>
            )}
          </dl>
        </>
      )}

      <ReportButton profileId={data.profile.id} profileType={data.type} />
    </div>
  );
}
