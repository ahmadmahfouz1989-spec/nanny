"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import EditShell from "@/components/onboarding/edit-shell";
import FieldLabel, { FieldError } from "@/components/onboarding/field-label";
import SectionHeading from "@/components/onboarding/section-heading";
import GenericPhotoField from "@/components/onboarding/generic-photo-field";
import LocationPicker from "@/components/onboarding/location-picker";
import NationalitySelect from "@/components/onboarding/nationality-select";
import LanguageSelect from "@/components/onboarding/language-select";
import { DAYS } from "@/lib/validation/profile";
import { CARE_SPECIALTIES, PATIENT_AGE_GROUPS, nursingSeekerSchema } from "@/lib/validation/nursing";
import { ui } from "@/lib/ui";
import { fieldErrorsFrom, scrollToFirstError } from "@/lib/form-errors";
import { request } from "@/lib/request";

type FormState = {
  fullName: string;
  contactPhone: string;
  locationId: string | null;
  locationDetail: string;
  nationality: string;
  scheduleType: "full_time" | "part_time" | "either";
  neededDays: string[];
  liveArrangement: "live_in" | "live_out" | "either";
  desiredStartDate: string;
  transportationRequired: boolean;
  patientAgeGroup: string;
  careSpecialtiesNeeded: string[];
  medicalConditionNotes: string;
  languageIds: string[];
};

const initialState: FormState = {
  fullName: "",
  contactPhone: "",
  locationId: null,
  locationDetail: "",
  nationality: "",
  scheduleType: "full_time",
  neededDays: [],
  liveArrangement: "live_out",
  desiredStartDate: "",
  transportationRequired: false,
  patientAgeGroup: "",
  careSpecialtiesNeeded: [],
  medicalConditionNotes: "",
  languageIds: [],
};

type ExistingProfile = {
  id: string;
  full_name: string;
  location_id: string | null;
  attributes: Record<string, unknown>;
  contact_phone: string | null;
  status: string;
  profile_photo_url?: string | null;
};

function stateFromExisting(p: ExistingProfile): FormState {
  const a = p.attributes;
  return {
    // A freshly-claimed draft (see /api/generic-profile/claim) has a
    // placeholder full_name -- show the field empty rather than that.
    fullName: p.status === "draft" ? "" : p.full_name,
    contactPhone: p.contact_phone ?? "",
    locationId: p.location_id,
    locationDetail: (a.locationDetail as string) ?? "",
    nationality: (a.nationality as string) ?? "",
    scheduleType: (a.scheduleType as FormState["scheduleType"]) ?? "full_time",
    neededDays: (a.neededDays as string[]) ?? [],
    liveArrangement: (a.liveArrangement as FormState["liveArrangement"]) ?? "live_out",
    desiredStartDate: (a.desiredStartDate as string) ?? "",
    transportationRequired: !!a.transportationRequired,
    patientAgeGroup: (a.patientAgeGroup as string) ?? "",
    careSpecialtiesNeeded: (a.careSpecialtiesNeeded as string[]) ?? [],
    medicalConditionNotes: (a.medicalConditionNotes as string) ?? "",
    languageIds: (a.languageIds as string[]) ?? [],
  };
}

export default function NursingSeekerForm({
  categorySlug,
  initialProfile,
  onBack,
}: {
  categorySlug: string;
  initialProfile: ExistingProfile | null;
  onBack?: () => void;
}) {
  const t = useTranslations("NursingSeekerOnboarding");
  const tw = useTranslations("Wizard");
  const tSchedule = useTranslations("ScheduleOptions");
  const tLive = useTranslations("LiveArrangementOptions");
  const tDays = useTranslations("Days");
  const tCare = useTranslations("CareSpecialties");
  const tPatientAge = useTranslations("PatientAgeGroups");
  const router = useRouter();
  const isEdit = !!initialProfile;
  // A claimed-but-unfilled draft still needs PATCH (a row already exists),
  // but should read as "create" to the user, not "edit" -- they haven't
  // submitted anything yet.
  const isRealEdit = isEdit && initialProfile!.status !== "draft";
  const [form, setForm] = useState(initialProfile ? stateFromExisting(initialProfile) : initialState);
  const [photoUrl, setPhotoUrl] = useState(initialProfile?.profile_photo_url ?? null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Set by the first failed save; from then on errors update live as the
  // fields are fixed.
  const [showErrors, setShowErrors] = useState(false);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggle(key: "neededDays" | "careSpecialtiesNeeded", value: string) {
    setForm((f) => ({
      ...f,
      [key]: f[key].includes(value) ? f[key].filter((v) => v !== value) : [...f[key], value],
    }));
  }

  const payload = {
    categorySlug,
    role: "seeker" as const,
    fullName: form.fullName,
    contactPhone: form.contactPhone || undefined,
    locationId: form.locationId,
    locationDetail: form.locationDetail,
    nationality: form.nationality,
    scheduleType: form.scheduleType,
    neededDays: form.neededDays,
    liveArrangement: form.liveArrangement,
    desiredStartDate: form.desiredStartDate,
    transportationRequired: form.transportationRequired,
    patientAgeGroup: form.patientAgeGroup,
    careSpecialtiesNeeded: form.careSpecialtiesNeeded,
    medicalConditionNotes: form.medicalConditionNotes || undefined,
    languageIds: form.languageIds,
  };
  const fieldErrors = showErrors ? fieldErrorsFrom(nursingSeekerSchema.safeParse(payload)) : {};

  async function handleSave() {
    setError(null);

    const parsed = nursingSeekerSchema.safeParse(payload);
    if (!parsed.success) {
      setShowErrors(true);
      scrollToFirstError();
      return;
    }

    setSubmitting(true);
    const res = await request("/api/generic-profile", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, profilePhotoUrl: photoUrl ?? undefined }),
    });
    setSubmitting(false);

    if (!res || !res.ok) {
      setError(tw("genericError"));
      return;
    }

    router.push(`/categories/${categorySlug}/dashboard`);
    router.refresh();
  }

  return (
    <EditShell
      title={isRealEdit ? t("editTitle") : t("createTitle")}
      error={error ?? (Object.keys(fieldErrors).length > 0 ? tw("fixHighlighted") : null)}
      onCancel={() => router.push(`/categories/${categorySlug}/dashboard`)}
      onSave={handleSave}
      onBack={onBack}
      backLabel={tw("changeRole")}
      submitting={submitting}
    >
      <div className="flex flex-col gap-3">
        <SectionHeading>{t("section1Title")}</SectionHeading>
        <input className={ui.input} placeholder={t("namePlaceholder")} value={form.fullName} onChange={(e) => update("fullName", e.target.value)} />
        <FieldError field="fullName" errors={fieldErrors} />
        <input type="tel" className={ui.input} placeholder={t("contactPhonePlaceholder")} value={form.contactPhone} onChange={(e) => update("contactPhone", e.target.value)} />
        <FieldError field="contactPhone" errors={fieldErrors} />
        <p className="-mt-1 text-xs text-muted">{tw("phoneHint")}</p>
        {initialProfile && (
          <GenericPhotoField profileId={initialProfile.id} value={photoUrl} onChange={setPhotoUrl} onError={setError} />
        )}
        <LocationPicker
          governorateId={form.locationId}
          detail={form.locationDetail}
          onGovernorate={(id) => update("locationId", id)}
          onDetail={(v) => update("locationDetail", v)}
        />
        <FieldError field="locationId" errors={fieldErrors} />
        <FieldError field="locationDetail" errors={fieldErrors} />
        <FieldLabel field="nationality" errors={fieldErrors}>{t("nationality")}</FieldLabel>
        <NationalitySelect value={form.nationality} onChange={(v) => update("nationality", v)} />
      </div>

      <div className="flex flex-col gap-3">
        <SectionHeading>{t("section2Title")}</SectionHeading>
        <FieldLabel field="patientAgeGroup" errors={fieldErrors}>{t("patientAgeGroup")}</FieldLabel>
        <select className={ui.select} value={form.patientAgeGroup} onChange={(e) => update("patientAgeGroup", e.target.value)}>
          <option value="">{t("patientAgeGroupPlaceholder")}</option>
          {PATIENT_AGE_GROUPS.map((g) => (
            <option key={g} value={g}>
              {tPatientAge(g)}
            </option>
          ))}
        </select>

        <FieldLabel field="careSpecialtiesNeeded" errors={fieldErrors}>{t("careSpecialtiesNeeded")}</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {CARE_SPECIALTIES.map((s) => (
            <button type="button" key={s} onClick={() => toggle("careSpecialtiesNeeded", s)} className={ui.pill(form.careSpecialtiesNeeded.includes(s))}>
              {tCare(s)}
            </button>
          ))}
        </div>

        <FieldLabel field="medicalConditionNotes" errors={fieldErrors} optional>{t("medicalConditionNotes")}</FieldLabel>
        <textarea className={ui.input} rows={3} maxLength={1000} value={form.medicalConditionNotes} onChange={(e) => update("medicalConditionNotes", e.target.value)} />
      </div>

      <div className="flex flex-col gap-3">
        <SectionHeading>{t("section3Title")}</SectionHeading>
        <FieldLabel field="scheduleType" errors={fieldErrors}>{t("schedule")}</FieldLabel>
        <select className={ui.select} value={form.scheduleType} onChange={(e) => update("scheduleType", e.target.value as FormState["scheduleType"])}>
          <option value="full_time">{tSchedule("full_time")}</option>
          <option value="part_time">{tSchedule("part_time")}</option>
          <option value="either">{tSchedule("either")}</option>
        </select>

        <FieldLabel field="neededDays" errors={fieldErrors} optional>{t("neededDays")}</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((day) => (
            <button type="button" key={day} onClick={() => toggle("neededDays", day)} className={ui.pill(form.neededDays.includes(day))}>
              {tDays(day)}
            </button>
          ))}
        </div>

        <FieldLabel field="liveArrangement" errors={fieldErrors}>{t("liveArrangement")}</FieldLabel>
        <select className={ui.select} value={form.liveArrangement} onChange={(e) => update("liveArrangement", e.target.value as FormState["liveArrangement"])}>
          <option value="live_in">{tLive("live_in")}</option>
          <option value="live_out">{tLive("live_out")}</option>
          <option value="either">{tLive("either")}</option>
        </select>

        <FieldLabel field="desiredStartDate" errors={fieldErrors}>{t("desiredStartDate")}</FieldLabel>
        <input type="date" className={ui.input} min={new Date().toISOString().slice(0, 10)} value={form.desiredStartDate} onChange={(e) => update("desiredStartDate", e.target.value)} />

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.transportationRequired} onChange={(e) => update("transportationRequired", e.target.checked)} className="accent-primary" />
          {t("transportationRequired")}
        </label>
      </div>

      <div className="flex flex-col gap-3">
        <SectionHeading>{t("section4Title")}</SectionHeading>
        <FieldLabel field="languageIds" errors={fieldErrors} optional>{t("preferredLanguages")}</FieldLabel>
        <LanguageSelect value={form.languageIds} onChange={(ids) => update("languageIds", ids)} />
      </div>
    </EditShell>
  );
}
