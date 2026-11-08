"use client";

import { useState } from "react";
import { initialFullName } from "@/lib/draft-profile";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import EditShell from "@/components/onboarding/edit-shell";
import AccountBasicsLine from "@/components/onboarding/account-basics-line";
import { useFormDraft } from "@/components/onboarding/use-form-draft";
import FieldLabel from "@/components/onboarding/field-label";
import SectionHeading from "@/components/onboarding/section-heading";
import LocationPicker from "@/components/onboarding/location-picker";
import DistrictCoverage from "@/components/onboarding/district-coverage";
import LanguageSelect from "@/components/onboarding/language-select";
import { AGE_GROUPS, DAYS } from "@/lib/validation/profile";
import { nannyProviderSchema } from "@/lib/validation/nanny";
import RateField, { EMPTY_RATE, ratePayload, rateState, type RateState } from "@/components/onboarding/rate-field";
import IdDocumentField from "@/components/onboarding/id-document-field";
import { CATEGORY_RATE_UNITS } from "@/lib/validation/rate";
import { ui } from "@/lib/ui";
import { fieldErrorsFor, requiredProgress, scrollToFirstError } from "@/lib/form-errors";
import { request } from "@/lib/request";

const CERTIFICATION_OPTIONS = ["first_aid_cpr", "early_childhood_ed", "newborn_care_specialist"] as const;

const RATE_UNITS = CATEGORY_RATE_UNITS.nanny;

type FormState = {
  fullName: string;
  contactPhone: string;
  profilePhotoUrl: string | null;
  locationId: string | null;
  locationDetail: string;
  districtId: string | null;
  areaId: string | null;
  coverDistrictIds: string[];
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
  rate: RateState;
};

const initialState: FormState = {
  fullName: "",
  contactPhone: "",
  profilePhotoUrl: null,
  locationId: null,
  locationDetail: "",
  districtId: null,
  areaId: null,
  coverDistrictIds: [],
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
  rate: EMPTY_RATE,
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
    fullName: initialFullName(p),
    contactPhone: p.contact_phone ?? "",
    profilePhotoUrl: p.profile_photo_url ?? null,
    locationId: p.location_id,
    locationDetail: (a.locationDetail as string) ?? "",
    districtId: (a.districtId as string) ?? null,
    areaId: (a.areaId as string) ?? null,
    coverDistrictIds: (a.coverDistrictIds as string[]) ?? [],
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
    rate: rateState(a.rate),
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
  // The row always exists by now (claimed as a draft when the role was
  // picked), so saving is always an update; a draft still reads as
  // "create" to the user.
  const isEdit = !!initialProfile && initialProfile.status !== "draft";
  const [form, setForm] = useState(initialProfile ? stateFromExisting(initialProfile) : initialState);
  // Answers kept on the phone until saved or cancelled (see useFormDraft).
  const draft = useFormDraft(`form-draft:${categorySlug}:provider:${initialProfile?.id ?? "new"}`, form, setForm);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Set by the first failed save; from then on errors update live as the
  // fields are fixed.
  const [showErrors, setShowErrors] = useState(false);
  const uploading = false;

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleFromArray(key: "days" | "certifications", value: string) {
    const arr = form[key];
    update(key, arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value]);
  }


  const activeAgeGroups = Object.keys(form.experience).filter((g) => form.experience[g] !== "");

  const payload = {
    fullName: form.fullName,
    contactPhone: form.contactPhone || undefined,
    profilePhotoUrl: form.profilePhotoUrl || undefined,
    locationId: form.locationId,
    locationDetail: form.locationDetail,
    districtId: form.districtId ?? undefined,
    areaId: form.areaId,
    // Your own district counts already.
    coverDistrictIds: form.coverDistrictIds.filter((id) => id !== form.districtId),
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
    rate: ratePayload(form.rate),
    languageIds: form.languageIds,
    experience: activeAgeGroups.map((ageGroup) => ({
      ageGroup,
      yearsExperience: Number(form.experience[ageGroup]),
    })),
  };
  const fieldErrors = showErrors ? fieldErrorsFor(nannyProviderSchema, payload) : {};
  const progress = requiredProgress(nannyProviderSchema, payload);

  async function handleSave() {
    setError(null);
    // A photo still uploading would be left out of the save.
    if (uploading) return;


    const parsed = nannyProviderSchema.safeParse(payload);
    if (!parsed.success) {
      setShowErrors(true);
      scrollToFirstError();
      return;
    }

    setSubmitting(true);
    const res = await request("/api/generic-profile", {
      method: initialProfile ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, categorySlug, role: "provider" }),
    });
    setSubmitting(false);

    if (!res || !res.ok) {
      setError(tw("genericError"));
      return;
    }

    draft.clear();
    router.push(`/categories/${categorySlug}/dashboard`);
    router.refresh();
  }

  function handleCancel() {
    draft.clear();
    router.push(`/categories/${categorySlug}/dashboard`);
  }

  const sectionHeading = (n: 1 | 2 | 3 | 4 | 5 | 6 | 7) => <SectionHeading>{t(`step${n}Title` as "step1Title")}</SectionHeading>;

  const content = (
    <>
      <div className="flex flex-col gap-3">
          {sectionHeading(1)}
          <AccountBasicsLine />
          {/* Optional: a checked ID shows as "ID checked" on the profile. */}
          {initialProfile && <IdDocumentField profileId={initialProfile.id} onStatus={() => {}} optional />}

          <LocationPicker
            governorateId={form.locationId}
            detail={form.locationDetail}
            districtId={form.districtId}
            areaId={form.areaId}
            onArea={(districtId, areaId) => setForm((f) => ({ ...f, districtId, areaId }))}
            onGovernorate={(id) => update("locationId", id)}
            onDetail={(v) => update("locationDetail", v)}
            errors={fieldErrors}
          />

          <DistrictCoverage

            value={form.coverDistrictIds}

            onChange={(ids) => setForm((f) => ({ ...f, coverDistrictIds: ids }))}

            homeDistrictId={form.districtId}

            homeGovernorateId={form.locationId}

          />
          <FieldLabel field="workRadiusKm" errors={fieldErrors}>{t("workRadius")}</FieldLabel>
          <input
            type="number"
            min={1}
            max={50}
            className={ui.input}
            value={form.workRadiusKm}
            onChange={(e) => update("workRadiusKm", e.target.value)}
          />
      </div>

      <div className="flex flex-col gap-3">
          {sectionHeading(2)}
          <FieldLabel field="employmentType" errors={fieldErrors}>{t("employmentType")}</FieldLabel>
          <select
            className={ui.select}
            value={form.employmentType}
            onChange={(e) => update("employmentType", e.target.value as FormState["employmentType"])}
          >
            <option value="full_time">{tEmployment("full_time")}</option>
            <option value="part_time">{tEmployment("part_time")}</option>
            <option value="either">{tEmployment("either")}</option>
          </select>
          <FieldLabel field="liveArrangementPref" errors={fieldErrors}>{t("liveArrangementPref")}</FieldLabel>
          <select
            className={ui.select}
            value={form.liveArrangementPref}
            onChange={(e) => update("liveArrangementPref", e.target.value as FormState["liveArrangementPref"])}
          >
            <option value="live_in">{tLive("live_in")}</option>
            <option value="live_out">{tLive("live_out")}</option>
            <option value="either">{tLive("either")}</option>
          </select>
      </div>

      <div className="flex flex-col gap-3">
          {sectionHeading(3)}
          <FieldLabel field="availability" errors={fieldErrors}>{t("availableDays")}</FieldLabel>
          <div className="flex flex-wrap gap-2">
            {DAYS.map((day) => (
              <button
                type="button"
                key={day}
                onClick={() => toggleFromArray("days", day)}
                aria-pressed={form.days.includes(day)}
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
      </div>

      <div className="flex flex-col gap-3">
          {sectionHeading(4)}
          <FieldLabel field="languageIds" errors={fieldErrors} optional>{t("languages")}</FieldLabel>
          <LanguageSelect value={form.languageIds} onChange={(ids) => update("languageIds", ids)} />
          <FieldLabel field="yearsExperience" errors={fieldErrors}>{t("yearsExperience")}</FieldLabel>
          <input
            type="number"
            min={0}
            step={0.5}
            className={ui.input}
            value={form.yearsExperience}
            onChange={(e) => update("yearsExperience", e.target.value)}
          />
      </div>

      <div className="flex flex-col gap-3">
          {sectionHeading(5)}
          <FieldLabel field="experience" errors={fieldErrors}>{t("experienceByAge")}</FieldLabel>
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
      </div>

      <div className="flex flex-col gap-3">
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
      </div>

      <div className="flex flex-col gap-3">
          {sectionHeading(7)}
          <FieldLabel field="certifications" errors={fieldErrors} optional>{t("certifications")}</FieldLabel>
          <div className="flex flex-wrap gap-2">
            {CERTIFICATION_OPTIONS.map((cert) => (
              <button
                type="button"
                key={cert}
                onClick={() => toggleFromArray("certifications", cert)}
                aria-pressed={form.certifications.includes(cert)}
                className={ui.pill(form.certifications.includes(cert))}
              >
                {tCert(cert)}
              </button>
            ))}
          </div>
          <FieldLabel field="shortIntro" errors={fieldErrors} optional className="mt-2">{t("shortIntro")}</FieldLabel>
          <textarea
            className={ui.input}
            rows={4}
            maxLength={500}
            value={form.shortIntro}
            onChange={(e) => update("shortIntro", e.target.value)}
          />
          <RateField units={RATE_UNITS} value={form.rate} onChange={(v) => update("rate", v)} errors={fieldErrors} notePlaceholder={t("rateNotePlaceholder")} />
      </div>
    </>
  );

  return (
    <EditShell
      progress={progress}
      restored={draft.restored}
      title={isEdit ? t("editTitle") : t("createTitle")}
      saveLabel={isEdit ? undefined : tw("submitProfile")}
      error={error ?? (Object.keys(fieldErrors).length > 0 ? tw("fixHighlighted") : null)}
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
