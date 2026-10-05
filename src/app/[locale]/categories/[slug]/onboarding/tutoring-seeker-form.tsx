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
import { SUBJECTS, GRADE_LEVELS, TUTORING_FORMATS, tutoringSeekerSchema } from "@/lib/validation/tutoring";
import { ui } from "@/lib/ui";
import { fieldErrorsFrom, scrollToFirstError } from "@/lib/form-errors";
import { request } from "@/lib/request";

type FormState = {
  fullName: string;
  contactPhone: string;
  locationId: string | null;
  locationDetail: string;
  nationality: string;
  subjectsNeeded: string[];
  gradeLevel: string;
  format: "online" | "in_person" | "either";
  neededDays: string[];
  desiredStartDate: string;
  transportationRequired: boolean;
  additionalNotes: string;
  languageIds: string[];
};

const initialState: FormState = {
  fullName: "",
  contactPhone: "",
  locationId: null,
  locationDetail: "",
  nationality: "",
  subjectsNeeded: [],
  gradeLevel: "",
  format: "either",
  neededDays: [],
  desiredStartDate: "",
  transportationRequired: false,
  additionalNotes: "",
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
    subjectsNeeded: (a.subjectsNeeded as string[]) ?? [],
    gradeLevel: (a.gradeLevel as string) ?? "",
    format: (a.format as FormState["format"]) ?? "either",
    neededDays: (a.neededDays as string[]) ?? [],
    desiredStartDate: (a.desiredStartDate as string) ?? "",
    transportationRequired: !!a.transportationRequired,
    additionalNotes: (a.additionalNotes as string) ?? "",
    languageIds: (a.languageIds as string[]) ?? [],
  };
}

export default function TutoringSeekerForm({
  categorySlug,
  initialProfile,
  onBack,
}: {
  categorySlug: string;
  initialProfile: ExistingProfile | null;
  onBack?: () => void;
}) {
  const t = useTranslations("TutoringSeekerOnboarding");
  const tw = useTranslations("Wizard");
  const tFormat = useTranslations("TutoringFormats");
  const tDays = useTranslations("Days");
  const tSubject = useTranslations("Subjects");
  const tGrade = useTranslations("GradeLevels");
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

  function toggle(key: "neededDays" | "subjectsNeeded", value: string) {
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
    subjectsNeeded: form.subjectsNeeded,
    gradeLevel: form.gradeLevel,
    format: form.format,
    neededDays: form.neededDays,
    desiredStartDate: form.desiredStartDate,
    transportationRequired: form.transportationRequired,
    additionalNotes: form.additionalNotes || undefined,
    languageIds: form.languageIds,
  };
  const fieldErrors = showErrors ? fieldErrorsFrom(tutoringSeekerSchema.safeParse(payload)) : {};

  async function handleSave() {
    setError(null);

    const parsed = tutoringSeekerSchema.safeParse(payload);
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
        <FieldLabel field="gradeLevel" errors={fieldErrors}>{t("gradeLevel")}</FieldLabel>
        <select className={ui.select} value={form.gradeLevel} onChange={(e) => update("gradeLevel", e.target.value)}>
          <option value="">{t("gradeLevelPlaceholder")}</option>
          {GRADE_LEVELS.map((g) => (
            <option key={g} value={g}>
              {tGrade(g)}
            </option>
          ))}
        </select>

        <FieldLabel field="subjectsNeeded" errors={fieldErrors}>{t("subjectsNeeded")}</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {SUBJECTS.map((s) => (
            <button type="button" key={s} onClick={() => toggle("subjectsNeeded", s)} className={ui.pill(form.subjectsNeeded.includes(s))}>
              {tSubject(s)}
            </button>
          ))}
        </div>

        <FieldLabel field="format" errors={fieldErrors}>{t("format")}</FieldLabel>
        <select className={ui.select} value={form.format} onChange={(e) => update("format", e.target.value as FormState["format"])}>
          {TUTORING_FORMATS.map((f) => (
            <option key={f} value={f}>
              {tFormat(f)}
            </option>
          ))}
        </select>

        <FieldLabel field="additionalNotes" errors={fieldErrors} optional>{t("additionalNotes")}</FieldLabel>
        <textarea className={ui.input} rows={3} maxLength={1000} value={form.additionalNotes} onChange={(e) => update("additionalNotes", e.target.value)} />
      </div>

      <div className="flex flex-col gap-3">
        <SectionHeading>{t("section3Title")}</SectionHeading>
        <FieldLabel field="neededDays" errors={fieldErrors} optional>{t("neededDays")}</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((day) => (
            <button type="button" key={day} onClick={() => toggle("neededDays", day)} className={ui.pill(form.neededDays.includes(day))}>
              {tDays(day)}
            </button>
          ))}
        </div>

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
