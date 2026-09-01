"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { ui } from "@/lib/ui";
import { labelOr } from "@/lib/i18n-fallback";

type LangRef = { languages: { id: string; name_en: string; name_ar: string; name_fr: string } };

type QueueProfile = {
  id: string;
  full_name: string;
  profile_photo_url?: string | null;
  profileType: "parent" | "nanny";
  locations: { name_en: string; name_ar: string; name_fr: string } | null;
  created_at: string;

  // parent-only
  num_children?: number;
  children_age_ranges?: string[];
  schedule_type?: string;
  live_arrangement?: string;
  desired_start_date?: string;
  transportation_required?: boolean;
  additional_duties?: string[];
  family_description?: string | null;
  parent_profile_languages?: LangRef[];

  // nanny-only
  work_radius_km?: number;
  employment_type?: string;
  live_arrangement_pref?: string;
  availability?: { days: string[] };
  years_experience?: number;
  has_transportation?: boolean;
  can_drive?: boolean;
  certifications?: string[];
  short_intro?: string | null;
  nanny_profile_languages?: LangRef[];
  nanny_experience?: { age_group: string; years_experience: number }[];
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

export default function AdminProfilesPage() {
  const t = useTranslations("Admin");
  const tParent = useTranslations("ParentOnboarding");
  const tNanny = useTranslations("NannyOnboarding");
  const tMatches = useTranslations("Matches");
  const tAgeGroups = useTranslations("AgeGroups");
  const tDays = useTranslations("Days");
  const tDuties = useTranslations("Duties");
  const tCerts = useTranslations("Certifications");
  const tSchedule = useTranslations("ScheduleOptions");
  const tLiveArrangement = useTranslations("LiveArrangementOptions");
  const locale = useLocale();
  const [profiles, setProfiles] = useState<QueueProfile[] | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState<string | null>(null);

  function load() {
    fetch("/api/admin/profiles?moderationStatus=pending")
      .then((res) => res.json())
      .then((body) => setProfiles(body.profiles));
  }

  useEffect(() => {
    load();
  }, []);

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
    await fetch(`/api/admin/profiles/${profile.id}/moderation`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileType: profile.profileType, status, notes: rejectNotes }),
    });
    setSubmitting(null);
    setRejecting(null);
    setNotes("");
    setProfiles((prev) => prev?.filter((p) => p.id !== profile.id) ?? null);
  }

  function renderDetails(profile: QueueProfile) {
    if (profile.profileType === "parent") {
      const langs = (profile.parent_profile_languages ?? []).map((l) => localizedLangName(l.languages, locale));
      return (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted">{tParent("numChildren")}</dt>
          <dd>{profile.num_children}</dd>
          <dt className="text-muted">{tParent("ageRanges")}</dt>
          <dd>{(profile.children_age_ranges ?? []).map((g) => tAgeGroups(g as never)).join(", ")}</dd>
          <dt className="text-muted">{tParent("schedule")}</dt>
          <dd>{tSchedule(profile.schedule_type as never)}</dd>
          <dt className="text-muted">{tParent("liveArrangement")}</dt>
          <dd>{tLiveArrangement(profile.live_arrangement as never)}</dd>
          <dt className="text-muted">{tParent("desiredStartDate")}</dt>
          <dd>{profile.desired_start_date}</dd>
          <dt className="text-muted">{tParent("preferredLanguages")}</dt>
          <dd>{langs.join(", ") || "—"}</dd>
          <dt className="text-muted">{tParent("transportationRequired")}</dt>
          <dd>{profile.transportation_required ? "Yes" : "No"}</dd>
          {(profile.additional_duties?.length ?? 0) > 0 && (
            <>
              <dt className="text-muted">{tParent("additionalDuties")}</dt>
              <dd>{(profile.additional_duties ?? []).map((d) => tDuties(d as never)).join(", ")}</dd>
            </>
          )}
          {profile.family_description && (
            <>
              <dt className="text-muted">{tParent("familyDescription")}</dt>
              <dd className="col-span-2 -mt-1">{profile.family_description}</dd>
            </>
          )}
        </dl>
      );
    }

    const langs = (profile.nanny_profile_languages ?? []).map((l) => localizedLangName(l.languages, locale));
    const experience = profile.nanny_experience ?? [];
    return (
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted">{tNanny("workRadius")}</dt>
        <dd>{profile.work_radius_km} km</dd>
        <dt className="text-muted">{tNanny("employmentType")}</dt>
        <dd>{tSchedule(profile.employment_type as never)}</dd>
        <dt className="text-muted">{tNanny("liveArrangementPref")}</dt>
        <dd>{tLiveArrangement(profile.live_arrangement_pref as never)}</dd>
        <dt className="text-muted">{tNanny("availableDays")}</dt>
        <dd>{(profile.availability?.days ?? []).map((d) => tDays(d as never)).join(", ")}</dd>
        <dt className="text-muted">{tNanny("yearsExperience")}</dt>
        <dd>{tMatches("yearsExperience", { years: profile.years_experience ?? 0 })}</dd>
        <dt className="text-muted">{tNanny("languages")}</dt>
        <dd>{langs.join(", ") || "—"}</dd>
        <dt className="text-muted">{tNanny("hasTransportation")}</dt>
        <dd>{profile.has_transportation ? "Yes" : "No"}</dd>
        <dt className="text-muted">{tNanny("canDrive")}</dt>
        <dd>{profile.can_drive ? "Yes" : "No"}</dd>
        {experience.length > 0 && (
          <>
            <dt className="text-muted">{tNanny("experienceByAge")}</dt>
            <dd>
              {experience.map((e) => `${tAgeGroups(e.age_group as never)} (${e.years_experience})`).join(", ")}
            </dd>
          </>
        )}
        {(profile.certifications?.length ?? 0) > 0 && (
          <>
            <dt className="text-muted">{tNanny("certifications")}</dt>
            <dd>{(profile.certifications ?? []).map((c) => labelOr(tCerts, c)).join(", ")}</dd>
          </>
        )}
        {profile.short_intro && (
          <>
            <dt className="text-muted">{tNanny("shortIntro")}</dt>
            <dd className="col-span-2 -mt-1">{profile.short_intro}</dd>
          </>
        )}
      </dl>
    );
  }

  return (
    <>
      <h1 className="font-display text-3xl font-semibold mb-8">{t("profilesTitle")}</h1>

      {profiles && profiles.length === 0 && <p className="text-sm text-muted">{t("profilesEmpty")}</p>}

      <div className="flex flex-col gap-4">
        {profiles?.map((profile) => {
          const area = localizedLocationName(profile.locations, locale);
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
                    {profile.profileType === "parent" ? t("typeParent") : t("typeNanny")}
                  </span>
                </div>
                {area && <p className="text-sm text-muted mb-3">{area}</p>}

                <button
                  type="button"
                  onClick={() => toggleExpanded(profile.id)}
                  className={ui.link + " text-sm mb-3 block"}
                >
                  {isExpanded ? t("hideDetails") : t("viewDetails")}
                </button>

                {isExpanded && <div className="mb-4">{renderDetails(profile)}</div>}

                {rejecting === profile.id ? (
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
