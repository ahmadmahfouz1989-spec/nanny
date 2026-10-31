"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import EditShell from "@/components/onboarding/edit-shell";
import { useFormDraft } from "@/components/onboarding/use-form-draft";
import FieldLabel, { FieldError } from "@/components/onboarding/field-label";
import SectionHeading from "@/components/onboarding/section-heading";
import LocationPicker from "@/components/onboarding/location-picker";
import CleaningServiceIcon from "@/components/cleaning-service-icon";
import { ChevronIcon } from "@/components/home-icons";
import { DAYS } from "@/lib/validation/profile";
import {
  CLEANING_SERVICES,
  DIRT_LEVELS,
  EXTRAS,
  FREQUENCIES,
  SEEKER_FIELDS,
  SIZES,
  TIMINGS,
  cleaningSeekerSchema,
  isRecurring,
  placeTypesFor,
  type CleaningService,
  type Frequency,
} from "@/lib/validation/cleaning";
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
  cleaningService: CleaningService | null;
  placeType: string;
  size: string;
  bathrooms: string;
  furnished: boolean | null;
  dirtLevel: string;
  extras: string[];
  windowsCount: string;
  highWindows: boolean;
  sofaSeats: string;
  carpets: string;
  mattresses: string;
  tankCount: string;
  frequency: Frequency;
  hoursPerVisit: string;
  timing: (typeof TIMINGS)[number];
  scheduledAt: string;
  neededDays: string[];
  needsSupplies: boolean;
  hasPets: boolean;
  canPickUp: boolean;
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
  cleaningService: null,
  placeType: "",
  size: "",
  bathrooms: "",
  furnished: null,
  dirtLevel: "",
  extras: [],
  windowsCount: "",
  highWindows: false,
  sofaSeats: "",
  carpets: "",
  mattresses: "",
  tankCount: "",
  frequency: "once",
  hoursPerVisit: "",
  timing: "asap",
  scheduledAt: "",
  neededDays: [],
  needsSupplies: false,
  hasPets: false,
  canPickUp: false,
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
    fullName: p.status === "draft" ? "" : p.full_name,
    contactPhone: p.contact_phone ?? "",
    locationId: p.location_id,
    locationDetail: str(a.locationDetail),
    districtId: (a.districtId as string) ?? null,
    areaId: (a.areaId as string) ?? null,
    cleaningService: (a.cleaningService as CleaningService) ?? null,
    placeType: str(a.placeType),
    size: str(a.size),
    bathrooms: num(a.bathrooms),
    furnished: typeof a.furnished === "boolean" ? a.furnished : null,
    dirtLevel: str(a.dirtLevel),
    extras: (a.extras as string[]) ?? [],
    windowsCount: num(a.windowsCount),
    highWindows: !!a.highWindows,
    sofaSeats: num(a.sofaSeats),
    carpets: num(a.carpets),
    mattresses: num(a.mattresses),
    tankCount: num(a.tankCount),
    frequency: (a.frequency as Frequency) ?? "once",
    hoursPerVisit: num(a.hoursPerVisit),
    timing: a.timing === "scheduled" ? "scheduled" : "asap",
    scheduledAt: str(a.scheduledAt),
    neededDays: (a.neededDays as string[]) ?? [],
    needsSupplies: !!a.needsSupplies,
    hasPets: !!a.hasPets,
    canPickUp: !!a.canPickUp,
    budgetUsd: num(a.budgetUsd),
    jobDescription: str(a.jobDescription),
  };
}

/**
 * A cleaning request. First the services as a list (the category's "what
 * do you need?" screen), then only the questions that service needs --
 * size and bathrooms for a home, how many seats for a sofa wash, and so on.
 */
export default function CleaningSeekerForm({
  categorySlug,
  initialProfile,
  onBack,
}: {
  categorySlug: string;
  initialProfile: ExistingProfile | null;
  onBack?: () => void;
}) {
  const t = useTranslations("CleaningSeekerOnboarding");
  const tw = useTranslations("Wizard");
  const tService = useTranslations("CleaningServices");
  const tOption = useTranslations("CleaningOptions");
  const tTiming = useTranslations("ErrandTiming");
  const tDays = useTranslations("Days");
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

  function toggle(key: "extras" | "neededDays", value: string) {
    setForm((f) => ({ ...f, [key]: f[key].includes(value) ? f[key].filter((v) => v !== value) : [...f[key], value] }));
  }

  function pickService(s: CleaningService | null) {
    setForm((f) => ({
      ...f,
      cleaningService: s,
      // Only home and office cleans repeat; the rest are one-off jobs.
      frequency: s && SEEKER_FIELDS[s].includes("frequency") ? f.frequency : "once",
      placeType: s === "office" && !["office", "shop"].includes(f.placeType) ? "" : f.placeType,
    }));
  }

  const service = form.cleaningService;
  const asks = (field: (typeof SEEKER_FIELDS)[CleaningService][number]) => !!service && SEEKER_FIELDS[service].includes(field);
  const recurring = isRecurring(form.frequency);
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
    cleaningService: service ?? undefined,
    placeType: asks("placeType") ? form.placeType || undefined : undefined,
    size: asks("size") ? form.size || undefined : undefined,
    bathrooms: asks("bathrooms") ? number(form.bathrooms) : undefined,
    furnished: asks("furnished") && form.furnished !== null ? form.furnished : undefined,
    dirtLevel: asks("dirtLevel") ? form.dirtLevel || undefined : undefined,
    extras: asks("extras") ? form.extras : [],
    windowsCount: asks("windowsCount") ? number(form.windowsCount) : undefined,
    highWindows: asks("highWindows") ? form.highWindows : undefined,
    sofaSeats: asks("sofaSeats") ? number(form.sofaSeats) : undefined,
    carpets: asks("carpets") ? number(form.carpets) : undefined,
    mattresses: asks("mattresses") ? number(form.mattresses) : undefined,
    tankCount: asks("tankCount") ? number(form.tankCount) : undefined,
    frequency: asks("frequency") ? form.frequency : "once",
    hoursPerVisit: asks("hoursPerVisit") ? number(form.hoursPerVisit) : undefined,
    timing: form.timing,
    scheduledAt: !recurring && form.timing === "scheduled" ? text(form.scheduledAt) : undefined,
    neededDays: recurring ? form.neededDays : [],
    needsSupplies: form.needsSupplies,
    hasPets: form.hasPets,
    canPickUp: form.canPickUp,
    budgetUsd: number(form.budgetUsd),
    jobDescription: text(form.jobDescription),
  };
  const fieldErrors = showErrors ? fieldErrorsFor(cleaningSeekerSchema, payload) : {};
  const progress = requiredProgress(cleaningSeekerSchema, payload);

  async function handleSave() {
    setError(null);

    const parsed = cleaningSeekerSchema.safeParse(payload);
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
          {CLEANING_SERVICES.map((s) => (
            <button
              type="button"
              key={s}
              onClick={() => pickService(s)}
              className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3.5 text-start transition hover:bg-surface-sunken active:scale-[0.99]"
            >
              <CleaningServiceIcon service={s} />
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

  const pills = <K extends "placeType" | "size" | "dirtLevel">(key: K, values: readonly string[], group: string) => (
    <div className="flex flex-wrap gap-2">
      {values.map((v) => (
        <button type="button" key={v} onClick={() => update(key, v)} className={ui.pill(form[key] === v)}>
          {tOption(`${group}.${v}`)}
        </button>
      ))}
    </div>
  );
  const countInput = (key: "bathrooms" | "windowsCount" | "sofaSeats" | "carpets" | "mattresses" | "tankCount" | "hoursPerVisit", max: number, optional = true) => (
    <>
      <FieldLabel field={key} errors={fieldErrors} optional={optional}>{t(key)}</FieldLabel>
      <input type="number" inputMode="numeric" min={key === "hoursPerVisit" || key === "bathrooms" ? 1 : 0} max={max} className={ui.input} value={form[key]} onChange={(e) => update(key, e.target.value)} />
    </>
  );
  const check = (key: "highWindows" | "needsSupplies" | "hasPets" | "canPickUp", label: string) => (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={form[key]} onChange={(e) => update(key, e.target.checked)} className="accent-primary" />
      {label}
    </label>
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
        <CleaningServiceIcon service={service} className="h-10 w-10" />
        <p className="min-w-0 flex-1 font-semibold">{tService(service)}</p>
        <button type="button" onClick={() => pickService(null)} className="text-sm font-medium text-primary">
          {t("changeService")}
        </button>
      </div>

      <div className="flex flex-col gap-3">
        <SectionHeading>{t("section1Title")}</SectionHeading>
        {asks("placeType") && (
          <>
            <FieldLabel field="placeType" errors={fieldErrors}>{t("placeType")}</FieldLabel>
            {pills("placeType", placeTypesFor(service), "placeType")}
          </>
        )}
        {asks("size") && (
          <>
            <FieldLabel field="size" errors={fieldErrors}>{t("size")}</FieldLabel>
            {pills("size", SIZES, "size")}
          </>
        )}
        {asks("bathrooms") && countInput("bathrooms", 10)}
        {asks("furnished") && (
          <>
            <FieldLabel field="furnished" errors={fieldErrors} optional>{t("furnished")}</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {([false, true] as const).map((v) => (
                <button type="button" key={String(v)} onClick={() => update("furnished", v)} className={ui.pill(form.furnished === v)}>
                  {v ? t("furnishedYes") : t("furnishedNo")}
                </button>
              ))}
            </div>
          </>
        )}
        {asks("dirtLevel") && (
          <>
            <FieldLabel field="dirtLevel" errors={fieldErrors} optional>{t("dirtLevel")}</FieldLabel>
            {pills("dirtLevel", DIRT_LEVELS, "dirtLevel")}
          </>
        )}
        {asks("windowsCount") && countInput("windowsCount", 200)}
        {asks("highWindows") && check("highWindows", t("highWindows"))}
        {asks("sofaSeats") && (
          <>
            <p className="text-sm text-muted">{t("itemsHint")}</p>
            {countInput("sofaSeats", 50)}
            <FieldError field="sofaSeats" errors={fieldErrors} />
            {countInput("carpets", 50)}
            {countInput("mattresses", 50)}
          </>
        )}
        {asks("tankCount") && countInput("tankCount", 20)}
        {asks("extras") && (
          <>
            <FieldLabel field="extras" errors={fieldErrors} optional>{t("extras")}</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {EXTRAS.map((x) => (
                <button type="button" key={x} onClick={() => toggle("extras", x)} className={ui.pill(form.extras.includes(x))}>
                  {tOption(`extras.${x}`)}
                </button>
              ))}
            </div>
          </>
        )}
        <FieldLabel field="jobDescription" errors={fieldErrors} optional={service !== "other"}>
          {service === "other" ? t("describeOther") : t("describe")}
        </FieldLabel>
        <textarea className={ui.input} rows={3} maxLength={1000} placeholder={t(`placeholder.${service}`)} value={form.jobDescription} onChange={(e) => update("jobDescription", e.target.value)} />
      </div>

      <div className="flex flex-col gap-3">
        <SectionHeading>{t("section2Title")}</SectionHeading>
        {asks("frequency") && (
          <>
            <FieldLabel field="frequency" errors={fieldErrors}>{t("frequency")}</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {FREQUENCIES.map((v) => (
                <button type="button" key={v} onClick={() => update("frequency", v)} className={ui.pill(form.frequency === v)}>
                  {tOption(`frequency.${v}`)}
                </button>
              ))}
            </div>
          </>
        )}
        {recurring ? (
          <>
            <FieldLabel field="neededDays" errors={fieldErrors} optional>{t("neededDays")}</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((day) => (
                <button type="button" key={day} onClick={() => toggle("neededDays", day)} className={ui.pill(form.neededDays.includes(day))}>
                  {tDays(day)}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <FieldLabel field="timing" errors={fieldErrors}>{t("timing")}</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {TIMINGS.map((v) => (
                <button type="button" key={v} onClick={() => update("timing", v)} className={ui.pill(form.timing === v)}>
                  {tTiming(v)}
                </button>
              ))}
            </div>
            {form.timing === "scheduled" && (
              <>
                <FieldLabel field="scheduledAt" errors={fieldErrors}>{t("scheduledAt")}</FieldLabel>
                <input type="datetime-local" className={ui.input} min={new Date().toISOString().slice(0, 16)} value={form.scheduledAt} onChange={(e) => update("scheduledAt", e.target.value)} />
              </>
            )}
          </>
        )}
        {asks("hoursPerVisit") && countInput("hoursPerVisit", 12)}
      </div>

      <div className="flex flex-col gap-3">
        <SectionHeading>{t("section3Title")}</SectionHeading>
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
        <p className={ui.label}>{t("good")}</p>
        {check("needsSupplies", t("needsSupplies"))}
        {check("canPickUp", t("canPickUp"))}
        {check("hasPets", t("hasPets"))}
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
