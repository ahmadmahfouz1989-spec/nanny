"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import WizardShell from "@/components/onboarding/wizard-shell";
import LocationPicker from "@/components/onboarding/location-picker";
import LanguageSelect from "@/components/onboarding/language-select";
import { AGE_GROUPS, parentProfileSchema } from "@/lib/validation/profile";
import { ui } from "@/lib/ui";

const TOTAL_STEPS = 6;
const DUTY_OPTIONS = ["light_housekeeping", "cooking", "pet_care", "homework_help", "laundry"] as const;

type FormState = {
  fullName: string;
  contactPhone: string;
  locationId: string | null;
  numChildren: number;
  childrenAgeRanges: string[];
  scheduleType: "full_time" | "part_time" | "either";
  liveArrangement: "live_in" | "live_out" | "either";
  desiredStartDate: string;
  salaryMin: string;
  salaryMax: string;
  transportationRequired: boolean;
  languageIds: string[];
  additionalDuties: string[];
  familyDescription: string;
};

const initialState: FormState = {
  fullName: "",
  contactPhone: "",
  locationId: null,
  numChildren: 1,
  childrenAgeRanges: [],
  scheduleType: "full_time",
  liveArrangement: "live_out",
  desiredStartDate: "",
  salaryMin: "",
  salaryMax: "",
  transportationRequired: false,
  languageIds: [],
  additionalDuties: [],
  familyDescription: "",
};

export default function ParentOnboarding() {
  const t = useTranslations("ParentOnboarding");
  const tw = useTranslations("Wizard");
  const tAge = useTranslations("AgeGroups");
  const tDuty = useTranslations("Duties");
  const tSchedule = useTranslations("ScheduleOptions");
  const tLive = useTranslations("LiveArrangementOptions");
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(initialState);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
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

  const stepValid = (() => {
    switch (step) {
      case 1:
        return form.fullName.trim().length >= 2 && !!form.locationId;
      case 2:
        return form.numChildren >= 1 && form.childrenAgeRanges.length > 0;
      case 3:
        return !!form.desiredStartDate;
      case 4:
        return form.salaryMin !== "" && form.salaryMax !== "" && Number(form.salaryMax) >= Number(form.salaryMin);
      case 5:
        return true;
      case 6:
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
      contactPhone: form.contactPhone || undefined,
      locationId: form.locationId,
      numChildren: form.numChildren,
      childrenAgeRanges: form.childrenAgeRanges,
      scheduleType: form.scheduleType,
      liveArrangement: form.liveArrangement,
      desiredStartDate: form.desiredStartDate,
      salaryMin: Number(form.salaryMin),
      salaryMax: Number(form.salaryMax),
      transportationRequired: form.transportationRequired,
      additionalDuties: form.additionalDuties,
      familyDescription: form.familyDescription || undefined,
      languageIds: form.languageIds,
    };

    const parsed = parentProfileSchema.safeParse(payload);
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
      nextDisabled={!stepValid}
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
          <input
            type="tel"
            className={ui.input}
            placeholder={t("contactPhonePlaceholder")}
            value={form.contactPhone}
            onChange={(e) => update("contactPhone", e.target.value)}
          />
          <p className="text-xs text-muted -mt-2">{t("contactPhoneHint")}</p>
          <LocationPicker value={form.locationId} onChange={(id) => update("locationId", id)} />
        </>
      )}

      {step === 2 && (
        <>
          <label className={ui.label}>{t("numChildren")}</label>
          <input
            type="number"
            min={1}
            max={10}
            className={ui.input}
            value={form.numChildren}
            onChange={(e) => update("numChildren", Number(e.target.value))}
          />
          <label className={ui.label}>{t("ageRanges")}</label>
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
        </>
      )}

      {step === 3 && (
        <>
          <label className={ui.label}>{t("schedule")}</label>
          <select
            className={ui.select}
            value={form.scheduleType}
            onChange={(e) => update("scheduleType", e.target.value as FormState["scheduleType"])}
          >
            <option value="full_time">{tSchedule("full_time")}</option>
            <option value="part_time">{tSchedule("part_time")}</option>
            <option value="either">{tSchedule("either")}</option>
          </select>
          <label className={ui.label}>{t("liveArrangement")}</label>
          <select
            className={ui.select}
            value={form.liveArrangement}
            onChange={(e) => update("liveArrangement", e.target.value as FormState["liveArrangement"])}
          >
            <option value="live_in">{tLive("live_in")}</option>
            <option value="live_out">{tLive("live_out")}</option>
            <option value="either">{tLive("either")}</option>
          </select>
          <label className={ui.label}>{t("desiredStartDate")}</label>
          <input
            type="date"
            className={ui.input}
            min={new Date().toISOString().slice(0, 10)}
            value={form.desiredStartDate}
            onChange={(e) => update("desiredStartDate", e.target.value)}
          />
        </>
      )}

      {step === 4 && (
        <>
          <label className={ui.label}>{t("salaryRange")}</label>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              min={0}
              placeholder={tw("min")}
              className={ui.input}
              value={form.salaryMin}
              onChange={(e) => update("salaryMin", e.target.value)}
            />
            <input
              type="number"
              min={0}
              placeholder={tw("max")}
              className={ui.input}
              value={form.salaryMax}
              onChange={(e) => update("salaryMax", e.target.value)}
            />
          </div>
        </>
      )}

      {step === 5 && (
        <>
          <label className={ui.label}>{t("preferredLanguages")}</label>
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
        </>
      )}

      {step === 6 && (
        <>
          <label className={ui.label}>{t("additionalDuties")}</label>
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
          <label className={ui.label + " mt-2"}>{t("familyDescription")}</label>
          <textarea
            className={ui.input}
            rows={4}
            maxLength={1000}
            value={form.familyDescription}
            onChange={(e) => update("familyDescription", e.target.value)}
          />
        </>
      )}
    </WizardShell>
  );
}
