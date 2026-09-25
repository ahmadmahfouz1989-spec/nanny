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
import { CARE_SPECIALTIES, nursingProviderSchema } from "@/lib/validation/nursing";
import { ui } from "@/lib/ui";

type FormState = {
  fullName: string;
  contactPhone: string;
  locationId: string | null;
  locationDetail: string;
  nationality: string;
  workRadiusKm: number;
  employmentType: "full_time" | "part_time" | "either";
  liveArrangementPref: "live_in" | "live_out" | "either";
  availabilityDays: string[];
  startTime: string;
  endTime: string;
  yearsExperience: number;
  hasTransportation: boolean;
  canDrive: boolean;
  licenseNumber: string;
  licenseIssuingAuthority: string;
  hasNursingDiploma: boolean;
  careSpecialties: string[];
  shortIntro: string;
  languageIds: string[];
};

const initialState: FormState = {
  fullName: "",
  contactPhone: "",
  locationId: null,
  locationDetail: "",
  nationality: "",
  workRadiusKm: 10,
  employmentType: "full_time",
  liveArrangementPref: "live_out",
  availabilityDays: [],
  startTime: "08:00",
  endTime: "18:00",
  yearsExperience: 0,
  hasTransportation: false,
  canDrive: false,
  licenseNumber: "",
  licenseIssuingAuthority: "",
  hasNursingDiploma: false,
  careSpecialties: [],
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
    workRadiusKm: (a.workRadiusKm as number) ?? 10,
    employmentType: (a.employmentType as FormState["employmentType"]) ?? "full_time",
    liveArrangementPref: (a.liveArrangementPref as FormState["liveArrangementPref"]) ?? "live_out",
    availabilityDays: availability.days ?? [],
    startTime: availability.startTime ?? "08:00",
    endTime: availability.endTime ?? "18:00",
    yearsExperience: (a.yearsExperience as number) ?? 0,
    hasTransportation: !!a.hasTransportation,
    canDrive: !!a.canDrive,
    licenseNumber: (a.licenseNumber as string) ?? "",
    licenseIssuingAuthority: (a.licenseIssuingAuthority as string) ?? "",
    // Existing profiles created before this field was added simply have no
    // value stored yet -- defaults to false (unanswered reads as "no")
    // until the nurse opens her profile and sets it explicitly.
    hasNursingDiploma: !!a.hasNursingDiploma,
    careSpecialties: (a.careSpecialties as string[]) ?? [],
    shortIntro: (a.shortIntro as string) ?? "",
    languageIds: (a.languageIds as string[]) ?? [],
  };
}

export default function NursingProviderForm({
  categorySlug,
  initialProfile,
  onBack,
}: {
  categorySlug: string;
  initialProfile: ExistingProfile | null;
  onBack?: () => void;
}) {
  const t = useTranslations("NursingProviderOnboarding");
  const tw = useTranslations("Wizard");
  const tSchedule = useTranslations("ScheduleOptions");
  const tLive = useTranslations("LiveArrangementOptions");
  const tDays = useTranslations("Days");
  const tCare = useTranslations("CareSpecialties");
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

  function toggle(key: "availabilityDays" | "careSpecialties", value: string) {
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
      workRadiusKm: form.workRadiusKm,
      employmentType: form.employmentType,
      liveArrangementPref: form.liveArrangementPref,
      availability: { days: form.availabilityDays, startTime: form.startTime, endTime: form.endTime },
      yearsExperience: form.yearsExperience,
      hasTransportation: form.hasTransportation,
      canDrive: form.canDrive,
      licenseNumber: form.licenseNumber,
      licenseIssuingAuthority: form.licenseIssuingAuthority || undefined,
      hasNursingDiploma: form.hasNursingDiploma,
      careSpecialties: form.careSpecialties,
      shortIntro: form.shortIntro || undefined,
      languageIds: form.languageIds,
    };

    const parsed = nursingProviderSchema.safeParse(payload);
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
        <label className={ui.label}>{t("licenseNumber")}</label>
        <input className={ui.input} value={form.licenseNumber} onChange={(e) => update("licenseNumber", e.target.value)} />
        <label className={ui.label}>{t("licenseIssuingAuthority")}</label>
        <input className={ui.input} value={form.licenseIssuingAuthority} onChange={(e) => update("licenseIssuingAuthority", e.target.value)} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.hasNursingDiploma} onChange={(e) => update("hasNursingDiploma", e.target.checked)} className="accent-primary" />
          {t("hasNursingDiploma")}
        </label>
      </div>

      <div className="flex flex-col gap-3">
        <SectionHeading>{t("section3Title")}</SectionHeading>
        <label className={ui.label}>{t("workRadius")}</label>
        <input type="number" min={1} max={50} className={ui.input} value={form.workRadiusKm} onChange={(e) => update("workRadiusKm", Number(e.target.value))} />

        <label className={ui.label}>{t("employmentType")}</label>
        <select className={ui.select} value={form.employmentType} onChange={(e) => update("employmentType", e.target.value as FormState["employmentType"])}>
          <option value="full_time">{tSchedule("full_time")}</option>
          <option value="part_time">{tSchedule("part_time")}</option>
          <option value="either">{tSchedule("either")}</option>
        </select>

        <label className={ui.label}>{t("liveArrangementPref")}</label>
        <select className={ui.select} value={form.liveArrangementPref} onChange={(e) => update("liveArrangementPref", e.target.value as FormState["liveArrangementPref"])}>
          <option value="live_in">{tLive("live_in")}</option>
          <option value="live_out">{tLive("live_out")}</option>
          <option value="either">{tLive("either")}</option>
        </select>

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
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.canDrive} onChange={(e) => update("canDrive", e.target.checked)} className="accent-primary" />
          {t("canDrive")}
        </label>
      </div>

      <div className="flex flex-col gap-3">
        <SectionHeading>{t("section4Title")}</SectionHeading>
        <label className={ui.label}>{t("careSpecialties")}</label>
        <div className="flex flex-wrap gap-2">
          {CARE_SPECIALTIES.map((s) => (
            <button type="button" key={s} onClick={() => toggle("careSpecialties", s)} className={ui.pill(form.careSpecialties.includes(s))}>
              {tCare(s)}
            </button>
          ))}
        </div>

        <label className={ui.label}>{t("preferredLanguages")}</label>
        <LanguageSelect value={form.languageIds} onChange={(ids) => update("languageIds", ids)} />

        <label className={ui.label}>{t("shortIntro")}</label>
        <textarea className={ui.input} rows={4} maxLength={500} value={form.shortIntro} onChange={(e) => update("shortIntro", e.target.value)} />
      </div>
    </EditShell>
  );
}
