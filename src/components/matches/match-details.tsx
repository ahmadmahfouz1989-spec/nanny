"use client";

import { useLocale, useTranslations } from "next-intl";
import { labelOr } from "@/lib/i18n-fallback";
import { useGovernorates, governorateNames } from "@/components/onboarding/use-governorates";
import type { OtherProfile } from "./match-card";

/**
 * The labelled details on a match card. Attributes differ per category
 * and role, so each row shows only when the profile has that field.
 */
export default function MatchDetails({ profile }: { profile: OtherProfile }) {
  const t = useTranslations("Matches");
  const tCare = useTranslations("CareSpecialties");
  const tSubject = useTranslations("Subjects");
  const tGrade = useTranslations("GradeLevels");
  const tSchedule = useTranslations("ScheduleOptions");
  const tLiveArrangement = useTranslations("LiveArrangementOptions");
  const tFormat = useTranslations("TutoringFormats");
  const tPatientAge = useTranslations("PatientAgeGroups");
  const tNanny = useTranslations("NannyOnboarding");
  const tParent = useTranslations("ParentOnboarding");
  const tNat = useTranslations("Nationality");
  const tAgeGroups = useTranslations("AgeGroups");
  const tCerts = useTranslations("Certifications");
  const tDuties = useTranslations("Duties");
  const tTrade = useTranslations("Trades");
  const tUrgency = useTranslations("Urgency");
  const locale = useLocale();
  const governorates = useGovernorates();

  const a = profile.attributes ?? {};
  const langs = (profile.languages ?? []).map((l) => (locale === "ar" ? l.name_ar : locale === "fr" ? l.name_fr : l.name_en));
  const experience = (Array.isArray(a.experience) ? a.experience : []) as { ageGroup: string; yearsExperience: number }[];
  const certifications = (Array.isArray(a.certifications) ? a.certifications : []) as string[];
  const childrenAgeRanges = (Array.isArray(a.childrenAgeRanges) ? a.childrenAgeRanges : []) as string[];
  const additionalDuties = (Array.isArray(a.additionalDuties) ? a.additionalDuties : []) as string[];
  const specialties = ((a.careSpecialties ?? a.careSpecialtiesNeeded ?? []) as string[]) ?? [];
  const subjects = ((a.subjects ?? a.subjectsNeeded ?? []) as string[]) ?? [];
  const trades = ((a.trades ?? a.tradesNeeded ?? []) as string[]) ?? [];
  const serviceAreas = governorateNames(a.serviceAreaIds, governorates, locale);

  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm mb-3">
      {typeof a.nationality === "string" && (
        <>
          <dt className="text-muted">{tNat("label")}</dt>
          <dd>{labelOr(tNat, a.nationality)}</dd>
        </>
      )}
      {childrenAgeRanges.length > 0 && (
        <>
          <dt className="text-muted">{tParent("ageRanges")}</dt>
          <dd>{childrenAgeRanges.map((g) => labelOr(tAgeGroups, g)).join(", ")}</dd>
        </>
      )}
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
      {typeof a.desiredStartDate === "string" && (
        <>
          <dt className="text-muted">{tParent("desiredStartDate")}</dt>
          <dd>{a.desiredStartDate}</dd>
        </>
      )}
      {langs.length > 0 && (
        <>
          <dt className="text-muted">{tNanny("languages")}</dt>
          <dd>{langs.join(", ")}</dd>
        </>
      )}
      {typeof a.hasTransportation === "boolean" && (
        <>
          <dt className="text-muted">{tNanny("hasTransportation")}</dt>
          <dd>{a.hasTransportation ? t("yes") : t("no")}</dd>
        </>
      )}
      {typeof a.transportationRequired === "boolean" && (
        <>
          <dt className="text-muted">{tParent("transportationRequired")}</dt>
          <dd>{a.transportationRequired ? t("yes") : t("no")}</dd>
        </>
      )}
      {typeof a.canDrive === "boolean" && (
        <>
          <dt className="text-muted">{tNanny("canDrive")}</dt>
          <dd>{a.canDrive ? t("yes") : t("no")}</dd>
        </>
      )}
      {experience.length > 0 && (
        <>
          <dt className="text-muted">{tNanny("experienceByAge")}</dt>
          <dd>{experience.map((e) => `${labelOr(tAgeGroups, e.ageGroup)} (${e.yearsExperience})`).join(", ")}</dd>
        </>
      )}
      {certifications.length > 0 && (
        <>
          <dt className="text-muted">{tNanny("certifications")}</dt>
          <dd>{certifications.map((c) => labelOr(tCerts, c)).join(", ")}</dd>
        </>
      )}
      {additionalDuties.length > 0 && (
        <>
          <dt className="text-muted">{tParent("additionalDuties")}</dt>
          <dd>{additionalDuties.map((d) => labelOr(tDuties, d)).join(", ")}</dd>
        </>
      )}
      {typeof a.hasNursingDiploma === "boolean" && (
        <>
          <dt className="text-muted">{t("criteriaNursingDiploma")}</dt>
          <dd>{a.hasNursingDiploma ? t("yes") : t("no")}</dd>
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
      {trades.length > 0 && (
        <>
          <dt className="text-muted">{t("criteriaTrade")}</dt>
          <dd>{trades.map((s) => labelOr(tTrade, s)).join(", ")}</dd>
        </>
      )}
      {typeof a.urgency === "string" && (
        <>
          <dt className="text-muted">{t("urgency")}</dt>
          <dd>{labelOr(tUrgency, a.urgency)}</dd>
        </>
      )}
      {serviceAreas.length > 0 && (
        <>
          <dt className="text-muted">{t("serviceAreas")}</dt>
          <dd>{serviceAreas.join(", ")}</dd>
        </>
      )}
      {typeof a.takesUrgentJobs === "boolean" && (
        <>
          <dt className="text-muted">{t("takesUrgentJobs")}</dt>
          <dd>{a.takesUrgentJobs ? t("yes") : t("no")}</dd>
        </>
      )}
    </dl>
  );
}
