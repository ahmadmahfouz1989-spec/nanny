"use client";

import { Fragment, useEffect, useState } from "react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { ui } from "@/lib/ui";
import { labelOr } from "@/lib/i18n-fallback";
import AdminPageHeader from "@/components/admin/admin-page-header";

type Language = { id: string; name_en: string; name_ar: string; name_fr: string };

type QueueProfile = {
  id: string;
  user_id: string;
  full_name: string;
  profile_photo_url: string | null;
  role: "seeker" | "provider";
  moderation_status: "pending" | "approved";
  attributes: Record<string, unknown>;
  languages: Language[];
  locations: { name_en: string; name_ar: string; name_fr: string } | null;
  categories: { slug: string; name_en: string; name_ar: string } | null;
  created_at: string;
  users: { email: string | null; contact_phone: string | null; status: string } | null;
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

function localizedLangName(l: Language, locale: string) {
  if (locale === "ar") return l.name_ar;
  if (locale === "fr") return l.name_fr;
  return l.name_en;
}

export default function AdminProfilesPage() {
  const t = useTranslations("Admin");
  const tParent = useTranslations("ParentOnboarding");
  const tNanny = useTranslations("NannyOnboarding");
  const tMatches = useTranslations("Matches");
  const tAgeGroups = useTranslations("AgeGroups");
  const tDays = useTranslations("Days");
  const tDuties = useTranslations("Duties");
  const tCerts = useTranslations("Certifications");
  const tCareSpecialties = useTranslations("CareSpecialties");
  const tSchedule = useTranslations("ScheduleOptions");
  const tLiveArrangement = useTranslations("LiveArrangementOptions");
  const tNat = useTranslations("Nationality");
  const tPatientAge = useTranslations("PatientAgeGroups");
  const tSubject = useTranslations("Subjects");
  const tGrade = useTranslations("GradeLevels");
  const tFormat = useTranslations("TutoringFormats");
  const tNursingProvider = useTranslations("NursingProviderOnboarding");
  const tNursingSeeker = useTranslations("NursingSeekerOnboarding");
  const tTutoringSeeker = useTranslations("TutoringSeekerOnboarding");
  const locale = useLocale();
  const [profiles, setProfiles] = useState<QueueProfile[] | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [categories, setCategories] = useState<{ slug: string; nameEn: string; nameAr: string }[]>([]);
  const [statusFilter, setStatusFilter] = useState<"pending" | "approved">("pending");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/analytics")
      .then((res) => res.json())
      .then((body) => setCategories(body.categories ?? []));
  }, []);

  function load() {
    const params = new URLSearchParams({ moderationStatus: statusFilter });
    if (categoryFilter) params.set("categorySlug", categoryFilter);
    if (roleFilter) params.set("role", roleFilter);
    fetch(`/api/admin/profiles?${params}`)
      .then((res) => res.json())
      .then((body) => setProfiles(body.profiles));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, categoryFilter, roleFilter]);

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function decide(profile: QueueProfile, status: "approved" | "rejected", rejectNotes?: string) {
    setSubmitting(profile.id);
    const res = await fetch(`/api/admin/profiles/${profile.id}/moderation`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, notes: rejectNotes }),
    });
    setSubmitting(null);

    if (!res.ok) {
      setNotice(t("moderationActionError"));
      setTimeout(() => setNotice(null), 8000);
      return;
    }

    setRejecting(null);
    setNotes("");
    setProfiles((prev) => prev?.filter((p) => p.id !== profile.id) ?? null);

    if (status === "rejected") {
      const body = await res.json().catch(() => null);
      if (body?.deleted === false) {
        setNotice(t("rejectedNotDeletedNotice", { name: profile.full_name }));
        setTimeout(() => setNotice(null), 8000);
      }
    }
  }

  // Reviewers need to see everything a profile says, in every category --
  // so known fields get a localized label and formatting, and anything
  // else still shows as raw key/value rather than being hidden.
  function renderDetails(profile: QueueProfile) {
    const a = profile.attributes ?? {};
    const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
    const yesNo = (v: unknown) => (v ? tMatches("yes") : tMatches("no"));
    const list = (v: unknown, label: (x: string) => string) => strings(v).map(label).join(", ");

    const known: Record<string, { label: string; value: (v: unknown) => string }> = {
      nationality: { label: tNat("label"), value: (v) => labelOr(tNat, String(v)) },
      workRadiusKm: { label: tNanny("workRadius"), value: (v) => `${v} km` },
      employmentType: { label: tNanny("employmentType"), value: (v) => labelOr(tSchedule, String(v)) },
      scheduleType: { label: tParent("schedule"), value: (v) => labelOr(tSchedule, String(v)) },
      liveArrangementPref: { label: tNanny("liveArrangementPref"), value: (v) => labelOr(tLiveArrangement, String(v)) },
      liveArrangement: { label: tParent("liveArrangement"), value: (v) => labelOr(tLiveArrangement, String(v)) },
      availability: {
        label: tNanny("availableDays"),
        value: (v) => {
          const av = (v ?? {}) as { days?: unknown; startTime?: unknown; endTime?: unknown };
          const days = list(av.days, (d) => labelOr(tDays, d));
          return av.startTime && av.endTime ? `${days} · ${av.startTime}–${av.endTime}` : days;
        },
      },
      neededDays: { label: tNanny("availableDays"), value: (v) => list(v, (d) => labelOr(tDays, d)) },
      yearsExperience: { label: tNanny("yearsExperience"), value: (v) => tMatches("yearsExperience", { years: Number(v) }) },
      experience: {
        label: tNanny("experienceByAge"),
        value: (v) =>
          (Array.isArray(v) ? (v as { ageGroup?: string; yearsExperience?: number }[]) : [])
            .map((e) => `${labelOr(tAgeGroups, e.ageGroup ?? "")} (${e.yearsExperience})`)
            .join(", "),
      },
      hasTransportation: { label: tNanny("hasTransportation"), value: yesNo },
      transportationRequired: { label: tParent("transportationRequired"), value: yesNo },
      canDrive: { label: tNanny("canDrive"), value: yesNo },
      certifications: { label: tNanny("certifications"), value: (v) => list(v, (c) => labelOr(tCerts, c)) },
      shortIntro: { label: tNanny("shortIntro"), value: String },
      numChildren: { label: tParent("numChildren"), value: String },
      childrenAgeRanges: { label: tParent("ageRanges"), value: (v) => list(v, (g) => labelOr(tAgeGroups, g)) },
      desiredStartDate: { label: tParent("desiredStartDate"), value: String },
      additionalDuties: { label: tParent("additionalDuties"), value: (v) => list(v, (d) => labelOr(tDuties, d)) },
      familyDescription: { label: tParent("familyDescription"), value: String },
      careSpecialties: { label: t("careSpecialties"), value: (v) => list(v, (x) => labelOr(tCareSpecialties, x)) },
      careSpecialtiesNeeded: { label: t("careSpecialties"), value: (v) => list(v, (x) => labelOr(tCareSpecialties, x)) },
      patientAgeGroup: { label: tNursingSeeker("patientAgeGroup"), value: (v) => labelOr(tPatientAge, String(v)) },
      medicalConditionNotes: { label: tNursingSeeker("medicalConditionNotes"), value: String },
      licenseNumber: { label: tNursingProvider("licenseNumber"), value: String },
      licenseIssuingAuthority: { label: tNursingProvider("licenseIssuingAuthority"), value: String },
      hasNursingDiploma: { label: tNursingProvider("hasNursingDiploma"), value: yesNo },
      subjects: { label: tMatches("criteriaSubject"), value: (v) => list(v, (x) => labelOr(tSubject, x)) },
      subjectsNeeded: { label: tMatches("criteriaSubject"), value: (v) => list(v, (x) => labelOr(tSubject, x)) },
      gradeLevel: { label: tMatches("criteriaGradeLevel"), value: (v) => labelOr(tGrade, String(v)) },
      gradeLevels: { label: tMatches("criteriaGradeLevel"), value: (v) => list(v, (x) => labelOr(tGrade, x)) },
      format: { label: tMatches("criteriaFormat"), value: (v) => labelOr(tFormat, String(v)) },
      additionalNotes: { label: tTutoringSeeker("additionalNotes"), value: String },
    };
    // Shown elsewhere on the card (area line) or resolved separately.
    const skip = new Set(["locationDetail", "languageIds"]);

    const rows: { key: string; label: string; value: string }[] = [];
    for (const [key, value] of Object.entries(a)) {
      if (skip.has(key) || value === null || value === undefined || value === "") continue;
      const field = known[key];
      const text = field
        ? field.value(value)
        : typeof value === "boolean"
          ? yesNo(value)
          : typeof value === "object"
            ? JSON.stringify(value)
            : String(value);
      if (text) rows.push({ key, label: field?.label ?? key, value: text });
    }
    const langs = profile.languages.map((l) => localizedLangName(l, locale));
    if (langs.length) rows.push({ key: "languages", label: tNanny("languages"), value: langs.join(", ") });

    return (
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {rows.map((row) => (
          <Fragment key={row.key}>
            <dt className="text-muted">{row.label}</dt>
            <dd>{row.value}</dd>
          </Fragment>
        ))}
      </dl>
    );
  }

  return (
    <>
      <AdminPageHeader
        title={statusFilter === "pending" ? t("profilesTitle") : t("directoryTitle")}
        description={statusFilter === "pending" ? t("profilesDescription") : t("directoryDescription")}
      />

      {notice && (
        <div className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning mb-4">{notice}</div>
      )}

      <div className="flex flex-wrap gap-2 mb-6">
        <select className={ui.select + " w-auto"} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "pending" | "approved")}>
          <option value="pending">{t("moderationPending")}</option>
          <option value="approved">{t("moderationApproved")}</option>
        </select>
        <select className={ui.select + " w-auto"} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="">{t("allCategories")}</option>
          {categories.map((c) => (
            <option key={c.slug} value={c.slug}>
              {locale === "ar" ? c.nameAr : c.nameEn}
            </option>
          ))}
        </select>
        <select className={ui.select + " w-auto"} value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
          <option value="">{t("allRoles")}</option>
          <option value="seeker">{t("roleSeeker")}</option>
          <option value="provider">{t("roleProvider")}</option>
        </select>
      </div>

      {profiles && profiles.length === 0 && <p className="text-sm text-muted">{t("profilesEmpty")}</p>}

      <div className="flex flex-col gap-4">
        {profiles?.map((profile) => {
          const locationDetail = profile.attributes?.locationDetail;
          const area = [localizedLocationName(profile.locations, locale), typeof locationDetail === "string" ? locationDetail : null]
            .filter(Boolean)
            .join(", ");
          const isExpanded = expanded.has(profile.id);
          return (
            <div key={profile.id} className={ui.card + " p-5 flex gap-4"}>
              {profile.profile_photo_url ? (
                <Image
                  src={profile.profile_photo_url}
                  alt=""
                  width={56}
                  height={56}
                  unoptimized
                  className="h-14 w-14 rounded-full object-cover shrink-0"
                />
              ) : (
                <div className="h-14 w-14 rounded-full bg-primary-soft shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-display text-lg font-semibold truncate">{profile.full_name}</p>
                  <span className={ui.badge("secondary")}>
                    {profile.categories ? (locale === "ar" ? profile.categories.name_ar : profile.categories.name_en) : ""}
                    {" · "}
                    {profile.role === "seeker" ? t("roleSeeker") : t("roleProvider")}
                  </span>
                  {profile.users?.status === "suspended" && (
                    <span className={ui.badge("danger")}>{t("columnStatus")}: {profile.users.status}</span>
                  )}
                </div>
                {(profile.users?.email || profile.users?.contact_phone) && (
                  <p className="text-sm text-muted mb-1">
                    {[profile.users?.email, profile.users?.contact_phone].filter(Boolean).join(" · ")}
                  </p>
                )}
                {area && <p className="text-sm text-muted mb-3">{area}</p>}

                <button
                  type="button"
                  onClick={() => toggleExpanded(profile.id)}
                  className={ui.link + " text-sm mb-3 block"}
                >
                  {isExpanded ? t("hideDetails") : t("viewDetails")}
                </button>

                {isExpanded && <div className="mb-4">{renderDetails(profile)}</div>}

                {profile.moderation_status !== "pending" ? null : rejecting === profile.id ? (
                  <div className="flex flex-col gap-2">
                    <textarea
                      className={ui.input}
                      rows={2}
                      placeholder={t("rejectNotesPlaceholder")}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => decide(profile, "rejected", notes)}
                        disabled={submitting === profile.id}
                        className={ui.buttonPrimary + " px-4! py-1.5! text-sm"}
                      >
                        {t("confirmReject")}
                      </button>
                      <button onClick={() => setRejecting(null)} className={ui.buttonGhost + " text-sm"}>
                        {t("cancel")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => decide(profile, "approved")}
                      disabled={submitting === profile.id}
                      className={ui.buttonPrimary + " px-4! py-1.5! text-sm"}
                    >
                      {t("approve")}
                    </button>
                    <button
                      onClick={() => setRejecting(profile.id)}
                      disabled={submitting === profile.id}
                      className={ui.buttonSecondary + " px-4! py-1.5! text-sm"}
                    >
                      {t("reject")}
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
