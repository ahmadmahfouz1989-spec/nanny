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
import LanguageSelect from "@/components/onboarding/language-select";
import { AGE_GROUPS, DAYS } from "@/lib/validation/profile";
import { nannySeekerSchema } from "@/lib/validation/nanny";
import BudgetField, { budgetPayload, budgetState, type BudgetState } from "@/components/onboarding/budget-field";
import { CATEGORY_RATE_UNITS } from "@/lib/validation/rate";
import { ui } from "@/lib/ui";
import { fieldErrorsFor, requiredProgress, scrollToFirstError } from "@/lib/form-errors";
import { request } from "@/lib/request";

const DUTY_OPTIONS = ["light_housekeeping", "cooking", "pet_care", "homework_help", "laundry"] as const;

const BUDGET_UNITS = CATEGORY_RATE_UNITS.nanny;

type FormState = {
  fullName: string;
  contactPhone: string;
  profilePhotoUrl: string | null;
  locationId: string | null;
  locationDetail: string;
  districtId: string | null;
  areaId: string | null;
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
  budget: BudgetState;
};

const initialState: FormState = {
  fullName: "",
  contactPhone: "",
  profilePhotoUrl: null,
  locationId: null,
  locationDetail: "",
  districtId: null,
  areaId: null,
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
  budget: { unit: BUDGET_UNITS[0], maxUsd: "" },
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
    fullName: initialFullName(p),
    contactPhone: p.contact_phone ?? "",
    profilePhotoUrl: p.profile_photo_url ?? null,
    locationId: p.location_id,
    locationDetail: (a.locationDetail as string) ?? "",
    districtId: (a.districtId as string) ?? null,
    areaId: (a.areaId as string) ?? null,
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
    budget: budgetState(a.budget, BUDGET_UNITS),
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
  // The row always exists by now (claimed as a draft when the role was
  // picked), so saving is always an update; a draft still reads as
  // "create" to the user.
  const isEdit = !!initialProfile && initialProfile.status !== "draft";
  const [form, setForm] = useState(initialProfile ? stateFromExisting(initialProfile) : initialState);
  // Answers kept on the phone until saved or cancelled (see useFormDraft).
  const draft = useFormDraft(`form-draft:${categorySlug}:seeker:${initialProfile?.id ?? "new"}`, form, setForm);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Set by the first failed save; from then on errors update live as the
  // fields are fixed.
  const [showErrors, setShowErrors] = useState(false);
  const uploading = false;

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

  const payload = {
    fullName: form.fullName,
    contactPhone: form.contactPhone || undefined,
    profilePhotoUrl: form.profilePhotoUrl || undefined,
    locationId: form.locationId,
    locationDetail: form.locationDetail,
    districtId: form.districtId ?? undefined,
    areaId: form.areaId,
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
    budget: budgetPayload(form.budget),
    languageIds: form.languageIds,
  };
  const fieldErrors = showErrors ? fieldErrorsFor(nannySeekerSchema, payload) : {};
  const progress = requiredProgress(nannySeekerSchema, payload);

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

    draft.clear();
    router.push(`/categories/${categorySlug}/dashboard`);
    router.refresh();
  }

  function handleCancel() {
    draft.clear();
    router.push(`/categories/${categorySlug}/dashboard`);
  }

  const sectionHeading = (n: 1 | 2 | 3 | 4 | 5) => <SectionHeading>{t(`step${n}Title` as "step1Title")}</SectionHeading>;

  const content = (
    <>
      <div className="flex flex-col gap-3">
          {sectionHeading(1)}
          <AccountBasicsLine />

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
                aria-pressed={form.childrenAgeRanges.includes(range)}
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
                aria-pressed={form.neededDays.includes(day)}
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
                aria-pressed={form.additionalDuties.includes(duty)}
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
          <BudgetField units={BUDGET_UNITS} value={form.budget} onChange={(v) => update("budget", v)} errors={fieldErrors} />
      </div>
    </>
  );

  return (
    <EditShell
      progress={progress}
      restored={draft.restored}
      title={isEdit ? t("editTitle") : t("createTitle")}
      saveLabel={isEdit ? undefined : tw("submitRequest")}
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
