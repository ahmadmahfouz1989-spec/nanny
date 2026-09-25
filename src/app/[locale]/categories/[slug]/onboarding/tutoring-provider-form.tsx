"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import EditShell from "@/components/onboarding/edit-shell";
import GenericPhotoField from "@/components/onboarding/generic-photo-field";
import LocationPicker from "@/components/onboarding/location-picker";
import NationalitySelect from "@/components/onboarding/nationality-select";
import LanguageSelect from "@/components/onboarding/language-select";
import { DAYS } from "@/lib/validation/profile";
import { SUBJECTS, GRADE_LEVELS, TUTORING_FORMATS, tutoringProviderSchema } from "@/lib/validation/tutoring";
import { ui } from "@/lib/ui";

type FormState = {
  fullName: string;
  contactPhone: string;
  locationId: string | null;
  locationDetail: string;
  nationality: string;
  subjects: string[];
  gradeLevels: string[];
  format: "online" | "in_person" | "either";
  availabilityDays: string[];
  startTime: string;
  endTime: string;
  yearsExperience: number;
  hasTransportation: boolean;
  shortIntro: string;
  languageIds: string[];
};

const initialState: FormState = {
  fullName: "",
  contactPhone: "",
  locationId: null,
  locationDetail: "",
  nationality: "",
  subjects: [],
  gradeLevels: [],
  format: "either",
  availabilityDays: [],
  startTime: "08:00",
  endTime: "18:00",
  yearsExperience: 0,
  hasTransportation: false,
  shortIntro: "",
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
  const availability = (a.availability as { days?: string[]; startTime?: string; endTime?: string }) ?? {};
  return {
    // A freshly-claimed draft (see /api/generic-profile/claim) has a
    // placeholder full_name -- show the field empty rather than that.
    fullName: p.status === "draft" ? "" : p.full_name,
    contactPhone: p.contact_phone ?? "",
    locationId: p.location_id,
    locationDetail: (a.locationDetail as string) ?? "",
    nationality: (a.nationality as string) ?? "",
    subjects: (a.subjects as string[]) ?? [],
    gradeLevels: (a.gradeLevels as string[]) ?? [],
    format: (a.format as FormState["format"]) ?? "either",
    availabilityDays: availability.days ?? [],
    startTime: availability.startTime ?? "08:00",
    endTime: availability.endTime ?? "18:00",
    yearsExperience: (a.yearsExperience as number) ?? 0,
    hasTransportation: !!a.hasTransportation,
    shortIntro: (a.shortIntro as string) ?? "",
    languageIds: (a.languageIds as string[]) ?? [],
  };
}

export default function TutoringProviderForm({
  categorySlug,
  initialProfile,
  onBack,
}: {
  categorySlug: string;
  initialProfile: ExistingProfile | null;
  onBack?: () => void;
}) {
  const t = useTranslations("TutoringProviderOnboarding");
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

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggle(key: "availabilityDays" | "subjects" | "gradeLevels", value: string) {
    setForm((f) => ({
      ...f,
      [key]: f[key].includes(value) ? f[key].filter((v) => v !== value) : [...f[key], value],
    }));
  }

  async function handleSave() {
    setError(null);
    const payload = {
      categorySlug,
      role: "provider" as const,
      fullName: form.fullName,
      contactPhone: form.contactPhone || undefined,
      locationId: form.locationId,
      locationDetail: form.locationDetail,
      nationality: form.nationality,
      subjects: form.subjects,
      gradeLevels: form.gradeLevels,
      format: form.format,
      availability: { days: form.availabilityDays, startTime: form.startTime, endTime: form.endTime },
      yearsExperience: form.yearsExperience,
      hasTransportation: form.hasTransportation,
      shortIntro: form.shortIntro || undefined,
      languageIds: form.languageIds,
    };

    const parsed = tutoringProviderSchema.safeParse(payload);
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
        <label className={ui.label}>{t("subjects")}</label>
        <div className="flex flex-wrap gap-2">
          {SUBJECTS.map((s) => (
            <button type="button" key={s} onClick={() => toggle("subjects", s)} className={ui.pill(form.subjects.includes(s))}>
              {tSubject(s)}
            </button>
          ))}
        </div>

        <label className={ui.label}>{t("gradeLevels")}</label>
        <div className="flex flex-wrap gap-2">
          {GRADE_LEVELS.map((g) => (
            <button type="button" key={g} onClick={() => toggle("gradeLevels", g)} className={ui.pill(form.gradeLevels.includes(g))}>
              {tGrade(g)}
            </button>
          ))}
        </div>

        <label className={ui.label}>{t("format")}</label>
        <select className={ui.select} value={form.format} onChange={(e) => update("format", e.target.value as FormState["format"])}>
          {TUTORING_FORMATS.map((f) => (
            <option key={f} value={f}>
              {tFormat(f)}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-3">
        <label className={ui.label}>{t("availableDays")}</label>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((day) => (
            <button type="button" key={day} onClick={() => toggle("availabilityDays", day)} className={ui.pill(form.availabilityDays.includes(day))}>
              {tDays(day)}
            </button>
          ))}
        </div>

        <label className={ui.label}>{t("yearsExperience")}</label>
        <input type="number" min={0} step={0.5} className={ui.input} value={form.yearsExperience} onChange={(e) => update("yearsExperience", Number(e.target.value))} />

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.hasTransportation} onChange={(e) => update("hasTransportation", e.target.checked)} className="accent-primary" />
          {t("hasTransportation")}
        </label>
      </div>

      <div className="flex flex-col gap-3">
        <label className={ui.label}>{t("preferredLanguages")}</label>
        <LanguageSelect value={form.languageIds} onChange={(ids) => update("languageIds", ids)} />

        <label className={ui.label}>{t("shortIntro")}</label>
        <textarea className={ui.input} rows={4} maxLength={500} value={form.shortIntro} onChange={(e) => update("shortIntro", e.target.value)} />
      </div>
    </EditShell>
  );
}
