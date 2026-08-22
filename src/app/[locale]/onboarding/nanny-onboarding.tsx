"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import Image from "next/image";
import WizardShell from "@/components/onboarding/wizard-shell";
import LocationPicker from "@/components/onboarding/location-picker";
import LanguageSelect from "@/components/onboarding/language-select";
import { AGE_GROUPS, DAYS, nannyProfileSchema } from "@/lib/validation/profile";
import { ui } from "@/lib/ui";

const TOTAL_STEPS = 7;
const CERTIFICATION_OPTIONS = ["first_aid_cpr", "early_childhood_ed", "newborn_care_specialist"] as const;

type FormState = {
  fullName: string;
  profilePhotoUrl: string | null;
  locationId: string | null;
  workRadiusKm: string;
  employmentType: "full_time" | "part_time" | "either";
  liveArrangementPref: "live_in" | "live_out" | "either";
  days: string[];
  startTime: string;
  endTime: string;
  languageIds: string[];
  yearsExperience: string;
  experience: Record<string, string>; // ageGroup -> years
  expectedSalaryMin: string;
  expectedSalaryMax: string;
  hasTransportation: boolean;
  canDrive: boolean;
  certifications: string[];
  shortIntro: string;
};

const initialState: FormState = {
  fullName: "",
  profilePhotoUrl: null,
  locationId: null,
  workRadiusKm: "10",
  employmentType: "full_time",
  liveArrangementPref: "live_out",
  days: [],
  startTime: "08:00",
  endTime: "18:00",
  languageIds: [],
  yearsExperience: "",
  experience: {},
  expectedSalaryMin: "",
  expectedSalaryMax: "",
  hasTransportation: false,
  canDrive: false,
  certifications: [],
  shortIntro: "",
};

export default function NannyOnboarding() {
  const t = useTranslations("NannyOnboarding");
  const tw = useTranslations("Wizard");
  const tAge = useTranslations("AgeGroups");
  const tDay = useTranslations("Days");
  const tCert = useTranslations("Certifications");
  const tEmployment = useTranslations("ScheduleOptions");
  const tLive = useTranslations("LiveArrangementOptions");
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(initialState);
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

  const stepValid = (() => {
    switch (step) {
      case 1:
        return form.fullName.trim().length >= 2 && !!form.locationId && !!form.profilePhotoUrl;
      case 2:
        return true;
      case 3:
        return form.days.length > 0;
      case 4:
        return form.yearsExperience !== "";
      case 5:
        return activeAgeGroups.length > 0;
      case 6:
        return form.expectedSalaryMin !== "" && form.expectedSalaryMax !== "" &&
          Number(form.expectedSalaryMax) >= Number(form.expectedSalaryMin);
      case 7:
        return true;
      default:
        return false;
    }
  })();

  async function handleNext() {
    setError(null);
    if (step < TOTAL_STEPS) {
      setStep(step + 1);
      return;
    }

    const payload = {
      fullName: form.fullName,
      profilePhotoUrl: form.profilePhotoUrl,
      locationId: form.locationId,
      workRadiusKm: Number(form.workRadiusKm),
      employmentType: form.employmentType,
      liveArrangementPref: form.liveArrangementPref,
      availability: { days: form.days, startTime: form.startTime, endTime: form.endTime },
      yearsExperience: Number(form.yearsExperience),
      expectedSalaryMin: Number(form.expectedSalaryMin),
      expectedSalaryMax: Number(form.expectedSalaryMax),
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

    const parsed = nannyProfileSchema.safeParse(payload);
    if (!parsed.success) {
      setError(tw("validationError"));
      return;
    }

    setSubmitting(true);
    const res = await fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSubmitting(false);

    if (!res.ok) {
      setError(tw("genericError"));
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  function handleBack() {
    setError(null);
    setStep((s) => Math.max(1, s - 1));
  }

  return (
    <WizardShell
      step={step}
      totalSteps={TOTAL_STEPS}
      title={t(`step${step}Title` as "step1Title")}
      error={error}
      onBack={handleBack}
      onNext={handleNext}
      nextLabel={step === TOTAL_STEPS ? tw("finish") : tw("next")}
      nextDisabled={!stepValid || uploading}
      submitting={submitting}
    >
      {step === 1 && (
        <>
          <input
            className={ui.input}
            placeholder={t("namePlaceholder")}
            value={form.fullName}
            onChange={(e) => update("fullName", e.target.value)}
          />

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

          <LocationPicker value={form.locationId} onChange={(id) => update("locationId", id)} />
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

      {step === 2 && (
        <>
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

      {step === 3 && (
        <>
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

      {step === 4 && (
        <>
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

      {step === 5 && (
        <>
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

      {step === 6 && (
        <>
          <label className={ui.label}>{t("expectedSalaryRange")}</label>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              min={0}
              placeholder={tw("min")}
              className={ui.input}
              value={form.expectedSalaryMin}
              onChange={(e) => update("expectedSalaryMin", e.target.value)}
            />
            <input
              type="number"
              min={0}
              placeholder={tw("max")}
              className={ui.input}
              value={form.expectedSalaryMax}
              onChange={(e) => update("expectedSalaryMax", e.target.value)}
            />
          </div>
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

      {step === 7 && (
        <>
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
    </WizardShell>
  );
}
