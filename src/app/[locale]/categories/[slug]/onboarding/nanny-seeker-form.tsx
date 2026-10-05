"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import EditShell from "@/components/onboarding/edit-shell";
import FieldLabel, { FieldError } from "@/components/onboarding/field-label";
import SectionHeading from "@/components/onboarding/section-heading";
import LocationPicker from "@/components/onboarding/location-picker";
import NationalitySelect from "@/components/onboarding/nationality-select";
import LanguageSelect from "@/components/onboarding/language-select";
import { AGE_GROUPS, DAYS } from "@/lib/validation/profile";
import { nannySeekerSchema } from "@/lib/validation/nanny";
import { ui } from "@/lib/ui";
import { fieldErrorsFrom, scrollToFirstError } from "@/lib/form-errors";
import { request } from "@/lib/request";

const DUTY_OPTIONS = ["light_housekeeping", "cooking", "pet_care", "homework_help", "laundry"] as const;

type FormState = {
  fullName: string;
  contactPhone: string;
  profilePhotoUrl: string | null;
  locationId: string | null;
  locationDetail: string;
  nationality: string;
  numChildren: number;
  childrenAgeRanges: string[];
  scheduleType: "full_time" | "part_time" | "either";
  neededDays: string[];
  liveArrangement: "live_in" | "live_out" | "either";
  desiredStartDate: string;
  transportationRequired: boolean;
  languageIds: string[];
  additionalDuties: string[];
  familyDescription: string;
};

const initialState: FormState = {
  fullName: "",
  contactPhone: "",
  profilePhotoUrl: null,
  locationId: null,
  locationDetail: "",
  nationality: "",
  numChildren: 1,
  childrenAgeRanges: [],
  scheduleType: "full_time",
  neededDays: [],
  liveArrangement: "live_out",
  desiredStartDate: "",
  transportationRequired: false,
  languageIds: [],
  additionalDuties: [],
  familyDescription: "",
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
  return {
    // A freshly-claimed draft (see /api/generic-profile/claim) has a
    // placeholder full_name -- show the field empty rather than that.
    fullName: p.status === "draft" ? "" : p.full_name,
    contactPhone: p.contact_phone ?? "",
    profilePhotoUrl: p.profile_photo_url ?? null,
    locationId: p.location_id,
    locationDetail: (a.locationDetail as string) ?? "",
    nationality: (a.nationality as string) ?? "",
    numChildren: (a.numChildren as number) ?? initialState.numChildren,
    childrenAgeRanges: (a.childrenAgeRanges as string[]) ?? [],
    scheduleType: (a.scheduleType as FormState["scheduleType"]) ?? initialState.scheduleType,
    neededDays: (a.neededDays as string[]) ?? [],
    liveArrangement: (a.liveArrangement as FormState["liveArrangement"]) ?? initialState.liveArrangement,
    desiredStartDate: (a.desiredStartDate as string) ?? "",
    transportationRequired: !!a.transportationRequired,
    languageIds: (a.languageIds as string[]) ?? [],
    additionalDuties: (a.additionalDuties as string[]) ?? [],
    familyDescription: (a.familyDescription as string) ?? "",
  };
}

export default function NannySeekerForm({
  categorySlug,
  initialProfile,
  onBack,
}: {
  categorySlug: string;
  initialProfile: ExistingProfile | null;
  onBack?: () => void;
}) {
  const t = useTranslations("ParentOnboarding");
  const tw = useTranslations("Wizard");
  const tAge = useTranslations("AgeGroups");
  const tDuty = useTranslations("Duties");
  const tSchedule = useTranslations("ScheduleOptions");
  const tLive = useTranslations("LiveArrangementOptions");
  const tDays = useTranslations("Days");
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  // The row always exists by now (claimed as a draft when the role was
  // picked), so saving is always an update; a draft still reads as
  // "create" to the user.
  const isEdit = !!initialProfile && initialProfile.status !== "draft";
  const [form, setForm] = useState(initialProfile ? stateFromExisting(initialProfile) : initialState);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Set by the first failed save; from then on errors update live as the
  // fields are fixed.
  const [showErrors, setShowErrors] = useState(false);
  const [uploading, setUploading] = useState(false);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
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

    const res = await request("/api/profile/photo", { method: "POST", body: formData });
    setUploading(false);

    if (!res || !res.ok) {
      setError(tw("genericError"));
      return;
    }

    const body = await res.json();
    update("profilePhotoUrl", body.url);
  }

  function toggleAgeRange(range: string) {
    update(
      "childrenAgeRanges",
      form.childrenAgeRanges.includes(range)
        ? form.childrenAgeRanges.filter((r) => r !== range)
        : [...form.childrenAgeRanges, range],
    );
  }

  function toggleDuty(duty: string) {
    update(
      "additionalDuties",
      form.additionalDuties.includes(duty)
        ? form.additionalDuties.filter((d) => d !== duty)
        : [...form.additionalDuties, duty],
    );
  }

  const payload = {
    fullName: form.fullName,
    contactPhone: form.contactPhone || undefined,
    profilePhotoUrl: form.profilePhotoUrl || undefined,
    locationId: form.locationId,
    locationDetail: form.locationDetail,
    nationality: form.nationality,
    numChildren: form.numChildren,
    childrenAgeRanges: form.childrenAgeRanges,
    scheduleType: form.scheduleType,
    neededDays: form.neededDays,
    liveArrangement: form.liveArrangement,
    desiredStartDate: form.desiredStartDate,
    transportationRequired: form.transportationRequired,
    additionalDuties: form.additionalDuties,
    familyDescription: form.familyDescription || undefined,
    languageIds: form.languageIds,
  };
  const fieldErrors = showErrors ? fieldErrorsFrom(nannySeekerSchema.safeParse(payload)) : {};

  async function handleSave() {
    setError(null);
    // A photo still uploading would be left out of the save.
    if (uploading) return;


    const parsed = nannySeekerSchema.safeParse(payload);
    if (!parsed.success) {
      setShowErrors(true);
      scrollToFirstError();
      return;
    }

    setSubmitting(true);
    const res = await request("/api/generic-profile", {
      method: initialProfile ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, categorySlug, role: "seeker" }),
    });
    setSubmitting(false);

    if (!res || !res.ok) {
      setError(tw("genericError"));
      return;
    }

    router.push(`/categories/${categorySlug}/dashboard`);
    router.refresh();
  }

  function handleCancel() {
    router.push(`/categories/${categorySlug}/dashboard`);
  }

  const sectionHeading = (n: 1 | 2 | 3 | 4 | 5) => <SectionHeading>{t(`step${n}Title` as "step1Title")}</SectionHeading>;

  const content = (
    <>
      <div className="flex flex-col gap-3">
          {sectionHeading(1)}
          <input
            className={ui.input}
            placeholder={t("namePlaceholder")}
            value={form.fullName}
            onChange={(e) => update("fullName", e.target.value)}
          />
        <FieldError field="fullName" errors={fieldErrors} />
          <input
            type="tel"
            className={ui.input}
            placeholder={t("contactPhonePlaceholder")}
            value={form.contactPhone}
            onChange={(e) => update("contactPhone", e.target.value)}
          />
        <FieldError field="contactPhone" errors={fieldErrors} />
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
                  <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
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
        <FieldError field="locationId" errors={fieldErrors} />
        <FieldError field="locationDetail" errors={fieldErrors} />
          <FieldLabel field="nationality" errors={fieldErrors}>{t("nationality")}</FieldLabel>
          <NationalitySelect value={form.nationality} onChange={(v) => update("nationality", v)} />
      </div>

      <div className="flex flex-col gap-3">
          {sectionHeading(2)}
          <FieldLabel field="numChildren" errors={fieldErrors}>{t("numChildren")}</FieldLabel>
          <input
            type="number"
            min={1}
            max={10}
            className={ui.input}
            value={form.numChildren}
            onChange={(e) => update("numChildren", Number(e.target.value))}
          />
          <FieldLabel field="childrenAgeRanges" errors={fieldErrors}>{t("ageRanges")}</FieldLabel>
          <div className="flex flex-wrap gap-2">
            {AGE_GROUPS.map((range) => (
              <button
                type="button"
                key={range}
                onClick={() => toggleAgeRange(range)}
                className={ui.pill(form.childrenAgeRanges.includes(range))}
              >
                {tAge(range)}
              </button>
            ))}
          </div>
      </div>

      <div className="flex flex-col gap-3">
          {sectionHeading(3)}
          <FieldLabel field="scheduleType" errors={fieldErrors}>{t("schedule")}</FieldLabel>
          <select
            className={ui.select}
            value={form.scheduleType}
            onChange={(e) => update("scheduleType", e.target.value as FormState["scheduleType"])}
          >
            <option value="full_time">{tSchedule("full_time")}</option>
            <option value="part_time">{tSchedule("part_time")}</option>
            <option value="either">{tSchedule("either")}</option>
          </select>

          <FieldLabel field="neededDays" errors={fieldErrors} optional>{t("neededDays")}</FieldLabel>
          <p className="text-xs text-muted -mt-2">{t("neededDaysHint")}</p>
          <div className="flex flex-wrap gap-2">
            {DAYS.map((day) => (
              <button
                type="button"
                key={day}
                onClick={() =>
                  update(
                    "neededDays",
                    form.neededDays.includes(day)
                      ? form.neededDays.filter((d) => d !== day)
                      : [...form.neededDays, day],
                  )
                }
                className={ui.pill(form.neededDays.includes(day))}
              >
                {tDays(day)}
              </button>
            ))}
          </div>

          <FieldLabel field="liveArrangement" errors={fieldErrors}>{t("liveArrangement")}</FieldLabel>
          <select
            className={ui.select}
            value={form.liveArrangement}
            onChange={(e) => update("liveArrangement", e.target.value as FormState["liveArrangement"])}
          >
            <option value="live_in">{tLive("live_in")}</option>
            <option value="live_out">{tLive("live_out")}</option>
            <option value="either">{tLive("either")}</option>
          </select>
          <FieldLabel field="desiredStartDate" errors={fieldErrors}>{t("desiredStartDate")}</FieldLabel>
          <input
            type="date"
            className={ui.input}
            min={new Date().toISOString().slice(0, 10)}
            value={form.desiredStartDate}
            onChange={(e) => update("desiredStartDate", e.target.value)}
          />
      </div>

      <div className="flex flex-col gap-3">
          {sectionHeading(4)}
          <FieldLabel field="languageIds" errors={fieldErrors} optional>{t("preferredLanguages")}</FieldLabel>
          <LanguageSelect value={form.languageIds} onChange={(ids) => update("languageIds", ids)} />
          <label className="flex items-center gap-2 text-sm mt-2">
            <input
              type="checkbox"
              checked={form.transportationRequired}
              onChange={(e) => update("transportationRequired", e.target.checked)}
              className="accent-primary"
            />
            {t("transportationRequired")}
          </label>
      </div>

      <div className="flex flex-col gap-3">
          {sectionHeading(5)}
          <FieldLabel field="additionalDuties" errors={fieldErrors} optional>{t("additionalDuties")}</FieldLabel>
          <div className="flex flex-wrap gap-2">
            {DUTY_OPTIONS.map((duty) => (
              <button
                type="button"
                key={duty}
                onClick={() => toggleDuty(duty)}
                className={ui.pill(form.additionalDuties.includes(duty))}
              >
                {tDuty(duty)}
              </button>
            ))}
          </div>
          <FieldLabel field="familyDescription" errors={fieldErrors} optional className="mt-2">{t("familyDescription")}</FieldLabel>
          <textarea
            className={ui.input}
            rows={4}
            maxLength={1000}
            value={form.familyDescription}
            onChange={(e) => update("familyDescription", e.target.value)}
          />
      </div>
    </>
  );

  return (
    <EditShell
      title={isEdit ? t("editTitle") : t("createTitle")}
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
