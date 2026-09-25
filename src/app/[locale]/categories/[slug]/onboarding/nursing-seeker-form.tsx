"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import EditShell from "@/components/onboarding/edit-shell";
import SectionHeading from "@/components/onboarding/section-heading";
import GenericPhotoField from "@/components/onboarding/generic-photo-field";
import LocationPicker from "@/components/onboarding/location-picker";
import NationalitySelect from "@/components/onboarding/nationality-select";
import LanguageSelect from "@/components/onboarding/language-select";
import { DAYS } from "@/lib/validation/profile";
import { CARE_SPECIALTIES, PATIENT_AGE_GROUPS, nursingSeekerSchema } from "@/lib/validation/nursing";
import { ui } from "@/lib/ui";

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

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggle(key: "neededDays" | "careSpecialtiesNeeded", value: string) {
    setForm((f) => ({
      ...f,
      [key]: f[key].includes(value) ? f[key].filter((v) => v !== value) : [...f[key], value],
    }));
  }

  async function handleSave() {
    setError(null);
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

    const parsed = nursingSeekerSchema.safeParse(payload);
    if (!parsed.success) {
      const msgs = [...new Set(parsed.error.issues.map((i) => i.message))];
      setError(msgs.length ? msgs.join(", ") : tw("validationError"));
      return;
    }

    setSubmitting(true);
    const res = await fetch("/api/generic-profile", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, profilePhotoUrl: photoUrl ?? undefined }),
    });
    setSubmitting(false);

    if (!res.ok) {
      setError(tw("genericError"));
      return;
    }

    router.push(`/categories/${categorySlug}/dashboard`);
    router.refresh();
  }

  return (
    <EditShell
      title={isRealEdit ? t("editTitle") : t("createTitle")}
      error={error}
      onCancel={() => router.push(`/categories/${categorySlug}/dashboard`)}
      onSave={handleSave}
      onBack={onBack}
      backLabel={tw("changeRole")}
      submitting={submitting}
    >
      <div className="flex flex-col gap-3">
        <SectionHeading>{t("section1Title")}</SectionHeading>
        <input className={ui.input} placeholder={t("namePlaceholder")} value={form.fullName} onChange={(e) => update("fullName", e.target.value)} />
        <input type="tel" className={ui.input} placeholder={t("contactPhonePlaceholder")} value={form.contactPhone} onChange={(e) => update("contactPhone", e.target.value)} />
        {initialProfile && (
          <GenericPhotoField profileId={initialProfile.id} value={photoUrl} onChange={setPhotoUrl} onError={setError} />
        )}
        <LocationPicker
          governorateId={form.locationId}
          detail={form.locationDetail}
          onGovernorate={(id) => update("locationId", id)}
          onDetail={(v) => update("locationDetail", v)}
        />
        <label className={ui.label}>{t("nationality")}</label>
        <NationalitySelect value={form.nationality} onChange={(v) => update("nationality", v)} />
      </div>

      <div className="flex flex-col gap-3">
        <SectionHeading>{t("section2Title")}</SectionHeading>
        <label className={ui.label}>{t("patientAgeGroup")}</label>
        <select className={ui.select} value={form.patientAgeGroup} onChange={(e) => update("patientAgeGroup", e.target.value)}>
          <option value="">{t("patientAgeGroupPlaceholder")}</option>
          {PATIENT_AGE_GROUPS.map((g) => (
            <option key={g} value={g}>
              {tPatientAge(g)}
            </option>
          ))}
        </select>

        <label className={ui.label}>{t("careSpecialtiesNeeded")}</label>
        <div className="flex flex-wrap gap-2">
          {CARE_SPECIALTIES.map((s) => (
            <button type="button" key={s} onClick={() => toggle("careSpecialtiesNeeded", s)} className={ui.pill(form.careSpecialtiesNeeded.includes(s))}>
              {tCare(s)}
            </button>
          ))}
        </div>

        <label className={ui.label}>{t("medicalConditionNotes")}</label>
        <textarea className={ui.input} rows={3} maxLength={1000} value={form.medicalConditionNotes} onChange={(e) => update("medicalConditionNotes", e.target.value)} />
      </div>

      <div className="flex flex-col gap-3">
        <SectionHeading>{t("section3Title")}</SectionHeading>
        <label className={ui.label}>{t("schedule")}</label>
        <select className={ui.select} value={form.scheduleType} onChange={(e) => update("scheduleType", e.target.value as FormState["scheduleType"])}>
          <option value="full_time">{tSchedule("full_time")}</option>
          <option value="part_time">{tSchedule("part_time")}</option>
          <option value="either">{tSchedule("either")}</option>
        </select>

        <label className={ui.label}>{t("neededDays")}</label>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((day) => (
            <button type="button" key={day} onClick={() => toggle("neededDays", day)} className={ui.pill(form.neededDays.includes(day))}>
              {tDays(day)}
            </button>
          ))}
        </div>

        <label className={ui.label}>{t("liveArrangement")}</label>
        <select className={ui.select} value={form.liveArrangement} onChange={(e) => update("liveArrangement", e.target.value as FormState["liveArrangement"])}>
          <option value="live_in">{tLive("live_in")}</option>
          <option value="live_out">{tLive("live_out")}</option>
          <option value="either">{tLive("either")}</option>
        </select>

        <label className={ui.label}>{t("desiredStartDate")}</label>
        <input type="date" className={ui.input} min={new Date().toISOString().slice(0, 10)} value={form.desiredStartDate} onChange={(e) => update("desiredStartDate", e.target.value)} />

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.transportationRequired} onChange={(e) => update("transportationRequired", e.target.checked)} className="accent-primary" />
          {t("transportationRequired")}
        </label>
      </div>

      <div className="flex flex-col gap-3">
        <SectionHeading>{t("section4Title")}</SectionHeading>
        <label className={ui.label}>{t("preferredLanguages")}</label>
        <LanguageSelect value={form.languageIds} onChange={(ids) => update("languageIds", ids)} />
      </div>
    </EditShell>
  );
}
