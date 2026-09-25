"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import Image from "next/image";
import EditShell from "@/components/onboarding/edit-shell";
import SectionHeading from "@/components/onboarding/section-heading";
import LocationPicker from "@/components/onboarding/location-picker";
import NationalitySelect from "@/components/onboarding/nationality-select";
import LanguageSelect from "@/components/onboarding/language-select";
import { AGE_GROUPS, DAYS } from "@/lib/validation/profile";
import { nannyProviderSchema } from "@/lib/validation/nanny";
import { ui } from "@/lib/ui";

const CERTIFICATION_OPTIONS = ["first_aid_cpr", "early_childhood_ed", "newborn_care_specialist"] as const;

type FormState = {
  fullName: string;
  contactPhone: string;
  profilePhotoUrl: string | null;
  locationId: string | null;
  locationDetail: string;
  nationality: string;
  workRadiusKm: string;
  employmentType: "full_time" | "part_time" | "either";
  liveArrangementPref: "live_in" | "live_out" | "either";
  days: string[];
  startTime: string;
  endTime: string;
  languageIds: string[];
  yearsExperience: string;
  experience: Record<string, string>; // ageGroup -> years
  hasTransportation: boolean;
  canDrive: boolean;
  certifications: string[];
  shortIntro: string;
};

const initialState: FormState = {
  fullName: "",
  contactPhone: "",
  profilePhotoUrl: null,
  locationId: null,
  locationDetail: "",
  nationality: "",
  workRadiusKm: "10",
  employmentType: "full_time",
  liveArrangementPref: "live_out",
  days: [],
  startTime: "08:00",
  endTime: "18:00",
  languageIds: [],
  yearsExperience: "",
  experience: {},
  hasTransportation: false,
  canDrive: false,
  certifications: [],
  shortIntro: "",
};

type ExistingProfile = {
  id: string;
  full_name: string;
  profile_photo_url?: string | null;
  location_id: string | null;
  attributes: Record<string, unknown>;
  contact_phone: string | null;
  status: string;
};

function stateFromExisting(p: ExistingProfile): FormState {
  const a = p.attributes;
  const availability = (a.availability ?? {}) as { days?: string[]; startTime?: string; endTime?: string };
  const experience = (a.experience ?? []) as { ageGroup: string; yearsExperience: number }[];
  return {
    // A freshly-claimed draft (see /api/generic-profile/claim) has a
    // placeholder full_name -- show the field empty rather than that.
    fullName: p.status === "draft" ? "" : p.full_name,
    contactPhone: p.contact_phone ?? "",
    profilePhotoUrl: p.profile_photo_url ?? null,
    locationId: p.location_id,
    locationDetail: (a.locationDetail as string) ?? "",
    nationality: (a.nationality as string) ?? "",
    workRadiusKm: a.workRadiusKm !== undefined ? String(a.workRadiusKm) : initialState.workRadiusKm,
    employmentType: (a.employmentType as FormState["employmentType"]) ?? initialState.employmentType,
    liveArrangementPref: (a.liveArrangementPref as FormState["liveArrangementPref"]) ?? initialState.liveArrangementPref,
    days: availability.days ?? [],
    startTime: availability.startTime ?? initialState.startTime,
    endTime: availability.endTime ?? initialState.endTime,
    languageIds: (a.languageIds as string[]) ?? [],
    yearsExperience: a.yearsExperience !== undefined ? String(a.yearsExperience) : "",
    experience: Object.fromEntries(experience.map((e) => [e.ageGroup, String(e.yearsExperience)])),
    hasTransportation: !!a.hasTransportation,
    canDrive: !!a.canDrive,
    certifications: (a.certifications as string[]) ?? [],
    shortIntro: (a.shortIntro as string) ?? "",
  };
}

export default function NannyProviderForm({
  categorySlug,
  initialProfile,
  onBack,
}: {
  categorySlug: string;
  initialProfile: ExistingProfile | null;
  onBack?: () => void;
}) {
  const t = useTranslations("NannyOnboarding");
  const tw = useTranslations("Wizard");
  const tAge = useTranslations("AgeGroups");
  const tDay = useTranslations("Days");
  const tCert = useTranslations("Certifications");
  const tEmployment = useTranslations("ScheduleOptions");
  const tLive = useTranslations("LiveArrangementOptions");
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  // The row always exists by now (claimed as a draft when the role was
  // picked), so saving is always an update; a draft still reads as
  // "create" to the user.
  const isEdit = !!initialProfile && initialProfile.status !== "draft";
  const [form, setForm] = useState(initialProfile ? stateFromExisting(initialProfile) : initialState);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleFromArray(key: "days" | "certifications", value: string) {
    const arr = form[key];
    update(key, arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value]);
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    const formData = new FormData();
    formData.append("file", file);
    // Staged against this profile: the file is uploaded now, but the
    // profile only points at it once Save sends profilePhotoUrl below, so
    // Cancel leaves the saved profile untouched.
    if (initialProfile) formData.append("genericProfileId", initialProfile.id);
    formData.append("stage", "true");

    const res = await fetch("/api/profile/photo", { method: "POST", body: formData });
    setUploading(false);

    if (!res.ok) {
      setError(tw("genericError"));
      return;
    }

    const body = await res.json();
    update("profilePhotoUrl", body.url);
  }

  const activeAgeGroups = Object.keys(form.experience).filter((g) => form.experience[g] !== "");

  async function handleSave() {
    setError(null);
    // A photo still uploading would be left out of the save.
    if (uploading) return;

    const payload = {
      fullName: form.fullName,
      contactPhone: form.contactPhone || undefined,
      profilePhotoUrl: form.profilePhotoUrl || undefined,
      locationId: form.locationId,
      locationDetail: form.locationDetail,
      nationality: form.nationality,
      workRadiusKm: Number(form.workRadiusKm),
      employmentType: form.employmentType,
      liveArrangementPref: form.liveArrangementPref,
      availability: { days: form.days, startTime: form.startTime, endTime: form.endTime },
      yearsExperience: Number(form.yearsExperience),
      hasTransportation: form.hasTransportation,
      canDrive: form.canDrive,
      certifications: form.certifications,
      shortIntro: form.shortIntro || undefined,
      languageIds: form.languageIds,
      experience: activeAgeGroups.map((ageGroup) => ({
        ageGroup,
        yearsExperience: Number(form.experience[ageGroup]),
      })),
    };

    const parsed = nannyProviderSchema.safeParse(payload);
    if (!parsed.success) {
      const msgs = [...new Set(parsed.error.issues.map((i) => i.message))];
      setError(msgs.length ? msgs.join(", ") : tw("validationError"));
      return;
    }

    setSubmitting(true);
    const res = await fetch("/api/generic-profile", {
      method: initialProfile ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, categorySlug, role: "provider" }),
    });
    setSubmitting(false);

    if (!res.ok) {
      setError(tw("genericError"));
      return;
    }

    router.push(`/categories/${categorySlug}/dashboard`);
    router.refresh();
  }

  function handleCancel() {
    router.push(`/categories/${categorySlug}/dashboard`);
  }

  const sectionHeading = (n: 1 | 2 | 3 | 4 | 5 | 6 | 7) => <SectionHeading>{t(`step${n}Title` as "step1Title")}</SectionHeading>;

  const content = (
    <>
      {(
        <>
          {sectionHeading(1)}
          <input
            className={ui.input}
            placeholder={t("namePlaceholder")}
            value={form.fullName}
            onChange={(e) => update("fullName", e.target.value)}
          />
          <input
            type="tel"
            className={ui.input}
            placeholder={t("contactPhonePlaceholder")}
            value={form.contactPhone}
            onChange={(e) => update("contactPhone", e.target.value)}
          />
          <p className="text-xs text-muted -mt-2">{t("contactPhoneHint")}</p>

          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-border bg-background text-muted overflow-hidden hover:border-primary/50 transition-colors"
            >
              {form.profilePhotoUrl ? (
                <Image
                  src={form.profilePhotoUrl}
                  alt=""
                  width={64}
                  height={64}
                  unoptimized
                  className="h-full w-full object-cover"
                />
              ) : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 5v14M5 12h14"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
              )}
            </button>
            <div className="text-sm">
              <button type="button" onClick={() => fileInputRef.current?.click()} className={ui.link}>
                {form.profilePhotoUrl ? t("changePhoto") : t("uploadPhoto")}
              </button>
              <p className="text-xs text-muted mt-0.5">{uploading ? t("uploading") : t("photoHint")}</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handlePhotoChange}
              className="hidden"
            />
          </div>

          <LocationPicker
            governorateId={form.locationId}
            detail={form.locationDetail}
            onGovernorate={(id) => update("locationId", id)}
            onDetail={(v) => update("locationDetail", v)}
          />
          <label className={ui.label}>{t("nationality")}</label>
          <NationalitySelect value={form.nationality} onChange={(v) => update("nationality", v)} />
          <label className={ui.label}>{t("workRadius")}</label>
          <input
            type="number"
            min={1}
            max={50}
            className={ui.input}
            value={form.workRadiusKm}
            onChange={(e) => update("workRadiusKm", e.target.value)}
          />
        </>
      )}

      {(
        <>
          {sectionHeading(2)}
          <label className={ui.label}>{t("employmentType")}</label>
          <select
            className={ui.select}
            value={form.employmentType}
            onChange={(e) => update("employmentType", e.target.value as FormState["employmentType"])}
          >
            <option value="full_time">{tEmployment("full_time")}</option>
            <option value="part_time">{tEmployment("part_time")}</option>
            <option value="either">{tEmployment("either")}</option>
          </select>
          <label className={ui.label}>{t("liveArrangementPref")}</label>
          <select
            className={ui.select}
            value={form.liveArrangementPref}
            onChange={(e) => update("liveArrangementPref", e.target.value as FormState["liveArrangementPref"])}
          >
            <option value="live_in">{tLive("live_in")}</option>
            <option value="live_out">{tLive("live_out")}</option>
            <option value="either">{tLive("either")}</option>
          </select>
        </>
      )}

      {(
        <>
          {sectionHeading(3)}
          <label className={ui.label}>{t("availableDays")}</label>
          <div className="flex flex-wrap gap-2">
            {DAYS.map((day) => (
              <button
                type="button"
                key={day}
                onClick={() => toggleFromArray("days", day)}
                className={ui.pill(form.days.includes(day))}
              >
                {tDay(day)}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={ui.label}>{t("from")}</label>
              <input
                type="time"
                className={ui.input + " w-full mt-1"}
                value={form.startTime}
                onChange={(e) => update("startTime", e.target.value)}
              />
            </div>
            <div>
              <label className={ui.label}>{t("to")}</label>
              <input
                type="time"
                className={ui.input + " w-full mt-1"}
                value={form.endTime}
                onChange={(e) => update("endTime", e.target.value)}
              />
            </div>
          </div>
        </>
      )}

      {(
        <>
          {sectionHeading(4)}
          <label className={ui.label}>{t("languages")}</label>
          <LanguageSelect value={form.languageIds} onChange={(ids) => update("languageIds", ids)} />
          <label className={ui.label}>{t("yearsExperience")}</label>
          <input
            type="number"
            min={0}
            step={0.5}
            className={ui.input}
            value={form.yearsExperience}
            onChange={(e) => update("yearsExperience", e.target.value)}
          />
        </>
      )}

      {(
        <>
          {sectionHeading(5)}
          <label className={ui.label}>{t("experienceByAge")}</label>
          {AGE_GROUPS.map((group) => (
            <div key={group} className="flex items-center justify-between gap-3">
              <span className="text-sm text-ink/80">{tAge(group)}</span>
              <input
                type="number"
                min={0}
                step={0.5}
                placeholder="—"
                className={ui.input + " w-24"}
                value={form.experience[group] ?? ""}
                onChange={(e) =>
                  update("experience", { ...form.experience, [group]: e.target.value })
                }
              />
            </div>
          ))}
        </>
      )}

      {(
        <>
          {sectionHeading(6)}
          <label className="flex items-center gap-2 text-sm mt-2">
            <input
              type="checkbox"
              checked={form.hasTransportation}
              onChange={(e) => update("hasTransportation", e.target.checked)}
              className="accent-primary"
            />
            {t("hasTransportation")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.canDrive}
              onChange={(e) => update("canDrive", e.target.checked)}
              className="accent-primary"
            />
            {t("canDrive")}
          </label>
        </>
      )}

      {(
        <>
          {sectionHeading(7)}
          <label className={ui.label}>{t("certifications")}</label>
          <div className="flex flex-wrap gap-2">
            {CERTIFICATION_OPTIONS.map((cert) => (
              <button
                type="button"
                key={cert}
                onClick={() => toggleFromArray("certifications", cert)}
                className={ui.pill(form.certifications.includes(cert))}
              >
                {tCert(cert)}
              </button>
            ))}
          </div>
          <label className={ui.label + " mt-2"}>{t("shortIntro")}</label>
          <textarea
            className={ui.input}
            rows={4}
            maxLength={500}
            value={form.shortIntro}
            onChange={(e) => update("shortIntro", e.target.value)}
          />
        </>
      )}
    </>
  );

  return (
    <EditShell
      title={isEdit ? t("editTitle") : t("createTitle")}
      error={error}
      onCancel={handleCancel}
      onSave={handleSave}
      onBack={onBack}
      backLabel={tw("changeRole")}
      submitting={submitting || uploading}
    >
      {content}
    </EditShell>
  );
}
