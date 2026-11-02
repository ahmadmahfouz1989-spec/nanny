"use client";

import { useState } from "react";
import { initialFullName } from "@/lib/draft-profile";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import EditShell from "@/components/onboarding/edit-shell";
import { useFormDraft } from "@/components/onboarding/use-form-draft";
import FieldLabel, { FieldError } from "@/components/onboarding/field-label";
import SectionHeading from "@/components/onboarding/section-heading";
import LocationPicker from "@/components/onboarding/location-picker";
import BeautyServiceIcon from "@/components/beauty-service-icon";
import { ChevronIcon } from "@/components/home-icons";
import {
  BEAUTY_SERVICES,
  FOR_WHOM,
  GENDER_PREFERENCES,
  GROUP_SERVICES,
  HAIR_LENGTHS,
  MASSAGE_MINUTES,
  PLACES,
  REMOVAL_AREAS,
  SCHEDULED_ONLY,
  TIMINGS,
  TREATMENTS,
  beautySeekerSchema,
  type BeautyService,
  type ForWhom,
  type GenderPreference,
  type Place,
} from "@/lib/validation/beauty";
import { ui } from "@/lib/ui";
import { fieldErrorsFor, requiredProgress, scrollToFirstError } from "@/lib/form-errors";
import { request } from "@/lib/request";

type FormState = {
  fullName: string;
  contactPhone: string;
  locationId: string | null;
  locationDetail: string;
  districtId: string | null;
  areaId: string | null;
  beautyService: BeautyService | null;
  treatments: string[];
  hairLength: string;
  massageMinutes: number | null;
  removalAreas: string[];
  peopleCount: string;
  forWhom: ForWhom | "";
  providerGender: GenderPreference;
  place: Place | "";
  timing: (typeof TIMINGS)[number];
  scheduledAt: string;
  budgetUsd: string;
  jobDescription: string;
};

const initialState: FormState = {
  fullName: "",
  contactPhone: "",
  locationId: null,
  locationDetail: "",
  districtId: null,
  areaId: null,
  beautyService: null,
  treatments: [],
  hairLength: "",
  massageMinutes: null,
  removalAreas: [],
  peopleCount: "1",
  forWhom: "",
  providerGender: "any",
  place: "",
  timing: "asap",
  scheduledAt: "",
  budgetUsd: "",
  jobDescription: "",
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

const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" ? String(v) : "");

function stateFromExisting(p: ExistingProfile): FormState {
  const a = p.attributes;
  return {
    // A freshly-claimed draft (see /api/generic-profile/claim) has a
    // placeholder full_name -- show the field empty rather than that.
    fullName: initialFullName(p),
    contactPhone: p.contact_phone ?? "",
    locationId: p.location_id,
    locationDetail: str(a.locationDetail),
    districtId: (a.districtId as string) ?? null,
    areaId: (a.areaId as string) ?? null,
    beautyService: (a.beautyService as BeautyService) ?? null,
    treatments: (a.treatments as string[]) ?? [],
    hairLength: str(a.hairLength),
    massageMinutes: typeof a.massageMinutes === "number" ? a.massageMinutes : null,
    removalAreas: (a.removalAreas as string[]) ?? [],
    peopleCount: num(a.peopleCount) || "1",
    forWhom: (a.forWhom as ForWhom) ?? "",
    providerGender: (a.providerGender as GenderPreference) ?? "any",
    place: (a.place as Place) ?? "",
    timing: a.timing === "scheduled" ? "scheduled" : "asap",
    scheduledAt: str(a.scheduledAt),
    budgetUsd: num(a.budgetUsd),
    jobDescription: str(a.jobDescription),
  };
}

/**
 * A beauty & wellness request. First the services as a list (the
 * category's "what do you need?" screen), then that service's treatments
 * and only the questions it needs -- hair length, how long a massage, which
 * areas to wax, how many people for a wedding.
 */
export default function BeautySeekerForm({
  categorySlug,
  initialProfile,
  onBack,
}: {
  categorySlug: string;
  initialProfile: ExistingProfile | null;
  onBack?: () => void;
}) {
  const t = useTranslations("BeautySeekerOnboarding");
  const tw = useTranslations("Wizard");
  const tService = useTranslations("BeautyServices");
  const tTreatment = useTranslations("BeautyTreatments");
  const tOption = useTranslations("BeautyOptions");
  const tFields = useTranslations("BeautyFields");
  const tTiming = useTranslations("ErrandTiming");
  const router = useRouter();
  const isEdit = !!initialProfile;
  // A claimed-but-unfilled draft still needs PATCH (a row already exists),
  // but should read as "create" to the user -- they haven't submitted anything yet.
  const isRealEdit = isEdit && initialProfile!.status !== "draft";
  const [form, setForm] = useState(initialProfile ? stateFromExisting(initialProfile) : initialState);
  // Answers kept on the phone until saved or cancelled (see useFormDraft).
  const draft = useFormDraft(`form-draft:${categorySlug}:seeker:${initialProfile?.id ?? "new"}`, form, setForm);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Set by the first failed save; from then on errors update live as the fields are fixed.
  const [showErrors, setShowErrors] = useState(false);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggle(key: "treatments" | "removalAreas", value: string) {
    setForm((f) => ({ ...f, [key]: f[key].includes(value) ? f[key].filter((v) => v !== value) : [...f[key], value] }));
  }

  function pickService(s: BeautyService | null) {
    setForm((f) => ({
      ...f,
      beautyService: s,
      // Another service's treatments don't carry over.
      treatments: s === f.beautyService ? f.treatments : [],
      // A wedding is booked ahead, never "as soon as possible".
      timing: s && SCHEDULED_ONLY.includes(s) ? "scheduled" : f.timing,
    }));
  }

  const service = form.beautyService;
  const scheduledOnly = !!service && SCHEDULED_ONLY.includes(service);
  const group = !!service && GROUP_SERVICES.includes(service);
  const text = (v: string) => v.trim() || undefined;
  const number = (v: string) => (v === "" ? undefined : Number(v));

  // Only the chosen service's fields are sent, so switching service
  // doesn't leave the old one's answers on the request.
  const payload = {
    categorySlug,
    role: "seeker" as const,
    fullName: form.fullName,
    contactPhone: form.contactPhone || undefined,
    locationId: form.locationId,
    locationDetail: form.locationDetail,
    districtId: form.districtId ?? undefined,
    areaId: form.areaId,
    beautyService: service ?? undefined,
    treatments: service ? form.treatments.filter((x) => TREATMENTS[service].includes(x)) : [],
    hairLength: service === "hair" ? form.hairLength || undefined : undefined,
    massageMinutes: service === "massage" ? (form.massageMinutes ?? undefined) : undefined,
    removalAreas: service === "hair_removal" ? form.removalAreas : [],
    peopleCount: group ? (number(form.peopleCount) ?? 1) : 1,
    forWhom: form.forWhom || undefined,
    providerGender: form.providerGender,
    place: form.place || undefined,
    timing: scheduledOnly ? "scheduled" : form.timing,
    scheduledAt: scheduledOnly || form.timing === "scheduled" ? text(form.scheduledAt) : undefined,
    budgetUsd: number(form.budgetUsd),
    jobDescription: text(form.jobDescription),
  };
  const fieldErrors = showErrors ? fieldErrorsFor(beautySeekerSchema, payload) : {};
  const progress = requiredProgress(beautySeekerSchema, payload);

  async function handleSave() {
    setError(null);

    const parsed = beautySeekerSchema.safeParse(payload);
    if (!parsed.success) {
      setShowErrors(true);
      scrollToFirstError();
      return;
    }

    setSubmitting(true);
    const res = await request("/api/generic-profile", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
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

  function cancel() {
    draft.clear();
    router.push(`/categories/${categorySlug}/dashboard`);
  }

  // Step one: which service.
  if (!service) {
    return (
      <EditShell progress={progress} restored={draft.restored} title={t("pickTitle")} onCancel={cancel} onBack={onBack} backLabel={tw("changeRole")}>
        <div className="flex flex-col gap-2.5">
          <p className="text-sm text-muted">{t("pickSubtitle")}</p>
          {BEAUTY_SERVICES.map((s) => (
            <button
              type="button"
              key={s}
              onClick={() => pickService(s)}
              className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3.5 text-start transition hover:bg-surface-sunken active:scale-[0.99]"
            >
              <BeautyServiceIcon service={s} />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-ink">{tService(s)}</span>
                <span className="block text-xs text-muted">{tService(`${s}Seeker`)}</span>
              </span>
              <ChevronIcon className="h-5 w-5 shrink-0 text-muted" />
            </button>
          ))}
        </div>
      </EditShell>
    );
  }

  const pills = <V extends string>(values: readonly V[], selected: (v: V) => boolean, onPick: (v: V) => void, label: (v: V) => string) => (
    <div className="flex flex-wrap gap-2">
      {values.map((v) => (
        <button type="button" key={v} onClick={() => onPick(v)} className={ui.pill(selected(v))}>
          {label(v)}
        </button>
      ))}
    </div>
  );

  return (
    <EditShell
      progress={progress}
      restored={draft.restored}
      title={isRealEdit ? t("editTitle") : t("createTitle")}
      saveLabel={isRealEdit ? undefined : tw("submitRequest")}
      error={error ?? (Object.keys(fieldErrors).length > 0 ? tw("fixHighlighted") : null)}
      onCancel={cancel}
      onSave={handleSave}
      onBack={onBack}
      backLabel={tw("changeRole")}
      submitting={submitting}
    >
      <div className="flex items-center gap-3 rounded-2xl bg-surface-sunken p-3">
        <BeautyServiceIcon service={service} className="h-10 w-10" />
        <p className="min-w-0 flex-1 font-semibold">{tService(service)}</p>
        <button type="button" onClick={() => pickService(null)} className="text-sm font-medium text-primary">
          {t("changeService")}
        </button>
      </div>

      <div className="flex flex-col gap-3">
        <SectionHeading>{t("section1Title")}</SectionHeading>
        {TREATMENTS[service].length > 0 && (
          <>
            <FieldLabel field="treatments" errors={fieldErrors} optional>{t("treatments")}</FieldLabel>
            {pills(TREATMENTS[service], (v) => form.treatments.includes(v), (v) => toggle("treatments", v), (v) => tTreatment(v))}
          </>
        )}
        {service === "hair" && (
          <>
            <FieldLabel field="hairLength" errors={fieldErrors} optional>{t("hairLength")}</FieldLabel>
            {pills(HAIR_LENGTHS, (v) => form.hairLength === v, (v) => update("hairLength", v), (v) => tOption(`hairLength.${v}`))}
          </>
        )}
        {service === "massage" && (
          <>
            <FieldLabel field="massageMinutes" errors={fieldErrors} optional>{t("massageMinutes")}</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {MASSAGE_MINUTES.map((m) => (
                <button type="button" key={m} onClick={() => update("massageMinutes", m)} className={ui.pill(form.massageMinutes === m)}>
                  {tFields("minutes", { count: m })}
                </button>
              ))}
            </div>
          </>
        )}
        {service === "hair_removal" && (
          <>
            <FieldLabel field="removalAreas" errors={fieldErrors} optional>{t("removalAreas")}</FieldLabel>
            {pills(REMOVAL_AREAS, (v) => form.removalAreas.includes(v), (v) => toggle("removalAreas", v), (v) => tOption(`removalAreas.${v}`))}
          </>
        )}
        {group && (
          <>
            <FieldLabel field="peopleCount" errors={fieldErrors}>{t("peopleCount")}</FieldLabel>
            <input type="number" inputMode="numeric" min={1} max={30} className={ui.input} value={form.peopleCount} onChange={(e) => update("peopleCount", e.target.value)} />
          </>
        )}
        <FieldLabel field="jobDescription" errors={fieldErrors} optional={service !== "other"}>
          {service === "other" ? t("describeOther") : t("describe")}
        </FieldLabel>
        <textarea className={ui.input} rows={3} maxLength={1000} placeholder={t(`placeholder.${service}`)} value={form.jobDescription} onChange={(e) => update("jobDescription", e.target.value)} />
      </div>

      <div className="flex flex-col gap-3">
        <SectionHeading>{t("section2Title")}</SectionHeading>
        <FieldLabel field="forWhom" errors={fieldErrors}>{t("forWhom")}</FieldLabel>
        {pills(FOR_WHOM, (v) => form.forWhom === v, (v) => update("forWhom", v), (v) => tOption(`forWhom.${v}`))}
        <FieldLabel field="providerGender" errors={fieldErrors}>{t("providerGender")}</FieldLabel>
        {pills(GENDER_PREFERENCES, (v) => form.providerGender === v, (v) => update("providerGender", v), (v) => tOption(`genderPreference.${v}`))}
      </div>

      <div className="flex flex-col gap-3">
        <SectionHeading>{t("section3Title")}</SectionHeading>
        <FieldLabel field="place" errors={fieldErrors}>{t("place")}</FieldLabel>
        {pills(PLACES, (v) => form.place === v, (v) => update("place", v), (v) => tOption(`place.${v}`))}
        {!scheduledOnly && (
          <>
            <FieldLabel field="timing" errors={fieldErrors}>{t("timing")}</FieldLabel>
            {pills(TIMINGS, (v) => form.timing === v, (v) => update("timing", v), (v) => tTiming(v))}
          </>
        )}
        {(scheduledOnly || form.timing === "scheduled") && (
          <>
            <FieldLabel field="scheduledAt" errors={fieldErrors}>{scheduledOnly ? t("weddingAt") : t("scheduledAt")}</FieldLabel>
            <input type="datetime-local" className={ui.input} min={new Date().toISOString().slice(0, 16)} value={form.scheduledAt} onChange={(e) => update("scheduledAt", e.target.value)} />
          </>
        )}
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
        <p className="-mt-1 text-xs text-muted">{t("addressHint")}</p>
        <FieldLabel field="budgetUsd" errors={fieldErrors} optional>{t("budgetUsd")}</FieldLabel>
        <input type="number" inputMode="decimal" min={0} className={ui.input} value={form.budgetUsd} onChange={(e) => update("budgetUsd", e.target.value)} />
      </div>

      <div className="flex flex-col gap-3">
        <SectionHeading>{t("section4Title")}</SectionHeading>
        <input className={ui.input} placeholder={t("namePlaceholder")} value={form.fullName} onChange={(e) => update("fullName", e.target.value)} />
        <FieldError field="fullName" errors={fieldErrors} />
        <input type="tel" className={ui.input} placeholder={t("contactPhonePlaceholder")} value={form.contactPhone} onChange={(e) => update("contactPhone", e.target.value)} />
        <FieldError field="contactPhone" errors={fieldErrors} />
        <p className="-mt-1 text-xs text-muted">{tw("phoneHint")}</p>
      </div>
    </EditShell>
  );
}
