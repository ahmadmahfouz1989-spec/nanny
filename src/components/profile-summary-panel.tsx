"use client";

import { Fragment, useEffect, useState } from "react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import ProfileRating from "@/components/matches/profile-rating";
import ReportButton from "@/components/matches/report-button";
import SaveProfileButton from "@/components/save-profile-button";
import AvatarIllustration from "@/components/illustrations/avatar-illustration";
import { labelOr } from "@/lib/i18n-fallback";
import { ui } from "@/lib/ui";
import { formatHoursRange } from "@/lib/format-hours";

type Language = { id: string; name_en: string; name_ar: string; name_fr: string };
type LocationRef = { name_en: string; name_ar: string; name_fr: string } | null;

type GenericProfile = {
  id: string;
  full_name: string;
  profile_photo_url: string | null;
  role: "seeker" | "provider";
  attributes: Record<string, unknown>;
  locations: LocationRef;
  categories: { slug: string; name_en: string; name_ar: string } | null;
  languages?: Language[];
};

type Response = { profile: GenericProfile; rating: { average: number | null; count: number }; featured: boolean; isSaved: boolean };

function localizedLocationName(loc: LocationRef, locale: string) {
  if (!loc) return null;
  if (locale === "ar") return loc.name_ar;
  if (locale === "fr") return loc.name_fr;
  return loc.name_en;
}

function localizedLangName(l: Language, locale: string) {
  if (locale === "ar") return l.name_ar;
  if (locale === "fr") return l.name_fr;
  return l.name_en;
}

// generic_profiles.attributes is category-specific jsonb (nanny, nursing,
// tutoring, ...) with no shared schema. Rather than dumping every key --
// which showed raw English code keys, enum ids and language UUIDs, and
// would also expose fields never meant for other users (license numbers,
// medical notes) -- the preview renders an explicit allow-list of known
// fields, each with the same localized labels generic-results.tsx and the
// onboarding forms use. Unknown keys are simply not shown.
function asStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/**
 * Compact read-only profile view opened by clicking a name outside the
 * scored-match context (currently: the feed). Same content a match card
 * would show minus the score/criteria/connect actions, which only make
 * sense next to an actual match.
 */
export default function ProfileSummaryPanel({
  profileId,
  matchId,
}: {
  profileId: string;
  matchId?: string;
}) {
  const t = useTranslations("Feed");
  const tNanny = useTranslations("NannyOnboarding");
  const tParent = useTranslations("ParentOnboarding");
  const tSaved = useTranslations("SavedProfiles");
  const tNat = useTranslations("Nationality");
  const tAgeGroups = useTranslations("AgeGroups");
  const tDuties = useTranslations("Duties");
  const tCerts = useTranslations("Certifications");
  const tSchedule = useTranslations("ScheduleOptions");
  const tLiveArrangement = useTranslations("LiveArrangementOptions");
  const tMatches = useTranslations("Matches");
  const tDays = useTranslations("Days");
  const tCare = useTranslations("CareSpecialties");
  const tPatientAge = useTranslations("PatientAgeGroups");
  const tSubject = useTranslations("Subjects");
  const tGrade = useTranslations("GradeLevels");
  const tFormat = useTranslations("TutoringFormats");
  const tNursingSeeker = useTranslations("NursingSeekerOnboarding");
  const locale = useLocale();

  const [data, setData] = useState<Response | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`/api/profiles/${profileId}`)
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
  }, [profileId]);

  if (failed) return <p className="mt-2 text-xs text-danger">{t("profileError")}</p>;
  if (!data) return <p className="mt-2 text-xs text-muted">{t("loading")}</p>;

  const area = localizedLocationName(data.profile.locations, locale);
  const langs = (data.profile.languages ?? []).map((l) => localizedLangName(l, locale));
  const photoUrl = data.profile.profile_photo_url;

  return (
    <div className="mt-2 rounded-xl border border-border bg-background p-4 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        {photoUrl ? (
          <Image src={photoUrl} alt="" width={48} height={48} className="h-12 w-12 rounded-full object-cover shrink-0" />
        ) : (
          <AvatarIllustration tone="primary" className="h-12 w-12 rounded-full overflow-hidden shrink-0" />
        )}
        <div className="min-w-0">
          <p className="font-display font-semibold text-ink truncate">{data.profile.full_name}</p>
          <p className="text-xs text-muted truncate">
            {area}
            {typeof data.profile.attributes?.locationDetail === "string"
              ? ` · ${data.profile.attributes.locationDetail}`
              : ""}
          </p>
        </div>
        <div className="ms-auto flex items-center gap-2 shrink-0">
          {data.featured && <span className="text-xs font-semibold text-berry">★ {t("featuredBadge")}</span>}
          <SaveProfileButton
            profileId={data.profile.id}
            initialSaved={data.isSaved}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted transition hover:bg-surface-sunken hover:text-ink"
          />
        </div>
      </div>

      <ProfileRating profileId={data.profile.id} average={data.rating.average} count={data.rating.count} />

      <>
          <div className="flex items-center gap-2">
            <span className={ui.badge("secondary")}>{data.profile.role === "seeker" ? tSaved("roleSeeking") : tSaved("roleOffering")}</span>
            {data.profile.categories && (
              <span className="text-xs text-muted">
                {locale === "ar" ? data.profile.categories.name_ar : data.profile.categories.name_en}
              </span>
            )}
          </div>
          {(() => {
            const a = data.profile.attributes ?? {};
            const yesNo = (v: boolean) => (v ? "✓" : "✗");
            const rows: { label: string; value: string }[] = [];
            const add = (label: string, value: string | null | undefined) => {
              if (value) rows.push({ label, value });
            };
            if (typeof a.nationality === "string") add(tNat("label"), labelOr(tNat, a.nationality));
            const schedule = a.employmentType ?? a.scheduleType;
            if (typeof schedule === "string") add(tMatches("criteriaEmploymentType"), labelOr(tSchedule, schedule));
            const live = a.liveArrangementPref ?? a.liveArrangement;
            if (typeof live === "string") add(tMatches("criteriaLiveArrangement"), labelOr(tLiveArrangement, live));
            const availability = a.availability as { days?: unknown; startTime?: unknown; endTime?: unknown } | undefined;
            const days = asStrings(availability?.days ?? a.neededDays);
            const hours = formatHoursRange(availability?.startTime, availability?.endTime, locale);
            if (days.length) {
              add(tMatches("criteriaAvailability"), days.map((d) => labelOr(tDays, d)).join(", ") + (hours ? ` · ${hours}` : ""));
            }
            if (typeof a.numChildren === "number") add(tParent("numChildren"), String(a.numChildren));
            const ageRanges = asStrings(a.childrenAgeRanges);
            if (ageRanges.length) add(tParent("ageRanges"), ageRanges.map((g) => labelOr(tAgeGroups, g)).join(", "));
            if (typeof a.desiredStartDate === "string") add(tParent("desiredStartDate"), a.desiredStartDate);
            if (typeof a.yearsExperience === "number") add(tNanny("yearsExperience"), String(a.yearsExperience));
            const experience = (Array.isArray(a.experience) ? a.experience : []) as { ageGroup?: unknown; yearsExperience?: unknown }[];
            const experienceText = experience
              .filter((e) => typeof e.ageGroup === "string")
              .map((e) => `${labelOr(tAgeGroups, e.ageGroup as string)} (${e.yearsExperience})`)
              .join(", ");
            if (experienceText) add(tNanny("experienceByAge"), experienceText);
            const certifications = asStrings(a.certifications);
            if (certifications.length) add(tNanny("certifications"), certifications.map((c) => labelOr(tCerts, c)).join(", "));
            const duties = asStrings(a.additionalDuties);
            if (duties.length) add(tParent("additionalDuties"), duties.map((d) => labelOr(tDuties, d)).join(", "));
            if (typeof a.workRadiusKm === "number") add(tNanny("workRadius"), String(a.workRadiusKm));
            if (typeof a.patientAgeGroup === "string") add(tNursingSeeker("patientAgeGroup"), labelOr(tPatientAge, a.patientAgeGroup));
            const specialties = asStrings(a.careSpecialties ?? a.careSpecialtiesNeeded);
            if (specialties.length) add(tMatches("criteriaSpecialty"), specialties.map((v) => labelOr(tCare, v)).join(", "));
            if (typeof a.hasNursingDiploma === "boolean") add(tMatches("criteriaNursingDiploma"), yesNo(a.hasNursingDiploma));
            const subjects = asStrings(a.subjects ?? a.subjectsNeeded);
            if (subjects.length) add(tMatches("criteriaSubject"), subjects.map((v) => labelOr(tSubject, v)).join(", "));
            const grades = typeof a.gradeLevel === "string" ? [a.gradeLevel] : asStrings(a.gradeLevels);
            if (grades.length) add(tMatches("criteriaGradeLevel"), grades.map((v) => labelOr(tGrade, v)).join(", "));
            if (typeof a.format === "string") add(tMatches("criteriaFormat"), labelOr(tFormat, a.format));
            const transport = a.hasTransportation ?? a.transportationRequired;
            if (typeof transport === "boolean") add(tMatches("criteriaTransportation"), yesNo(transport));
            if (typeof a.canDrive === "boolean") add(tNanny("canDrive"), yesNo(a.canDrive));
            if (langs.length) add(tMatches("criteriaLanguage"), langs.join(", "));

            return (
              <>
                {typeof a.shortIntro === "string" && a.shortIntro && <p className="text-sm text-ink/80">{a.shortIntro}</p>}
                {typeof a.familyDescription === "string" && a.familyDescription && (
                  <p className="text-sm text-ink/80">{a.familyDescription}</p>
                )}
                {rows.length > 0 && (
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                    {rows.map((row) => (
                      <Fragment key={row.label}>
                        <dt className="text-muted">{row.label}</dt>
                        <dd>{row.value}</dd>
                      </Fragment>
                    ))}
                  </dl>
                )}
              </>
            );
          })()}
      </>

      <ReportButton profileId={data.profile.id} matchId={matchId} />
    </div>
  );
}
