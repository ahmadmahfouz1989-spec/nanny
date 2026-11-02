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
import CarServiceIcon from "@/components/car-service-icon";
import { ChevronIcon } from "@/components/home-icons";
import {
  ASKS_DRIVABLE,
  CAR_SERVICES,
  FUELS,
  ISSUES,
  MAKES,
  ON_THE_SPOT,
  PLACES,
  TIMINGS,
  carSeekerSchema,
  type CarPlace,
  type CarService,
  type CarTiming,
  type Fuel,
} from "@/lib/validation/car";
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
  carService: CarService | null;
  issues: string[];
  carMake: string;
  carModel: string;
  carYear: string;
  fuel: Fuel;
  drivable: boolean | null;
  towTo: string;
  place: CarPlace | "";
  timing: CarTiming;
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
  carService: null,
  issues: [],
  carMake: "",
  carModel: "",
  carYear: "",
  fuel: "petrol",
  drivable: null,
  towTo: "",
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
    carService: (a.carService as CarService) ?? null,
    issues: (a.issues as string[]) ?? [],
    carMake: str(a.carMake),
    carModel: str(a.carModel),
    carYear: num(a.carYear),
    fuel: (a.fuel as Fuel) ?? "petrol",
    drivable: typeof a.drivable === "boolean" ? a.drivable : null,
    towTo: str(a.towTo),
    place: (a.place as CarPlace) ?? "",
    timing: (a.timing as CarTiming) ?? "asap",
    scheduledAt: str(a.scheduledAt),
    budgetUsd: num(a.budgetUsd),
    jobDescription: str(a.jobDescription),
  };
}

/**
 * A car services request. First the services as a list ("what do you
 * need?"), then what's wrong, the car, and where and when -- towing and
 * roadside help skip "where" (it's wherever the car is) and default to now.
 */
export default function CarSeekerForm({
  categorySlug,
  initialProfile,
  onBack,
}: {
  categorySlug: string;
  initialProfile: ExistingProfile | null;
  onBack?: () => void;
}) {
  const t = useTranslations("CarSeekerOnboarding");
  const tw = useTranslations("Wizard");
  const tService = useTranslations("CarServices");
  const tIssue = useTranslations("CarIssues");
  const tMake = useTranslations("CarMakes");
  const tOption = useTranslations("CarOptions");
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

  function pickService(s: CarService | null) {
    setForm((f) => ({
      ...f,
      carService: s,
      // Another service's issues don't carry over.
      issues: s === f.carService ? f.issues : [],
      // Someone stuck by the road needs help now.
      timing: s && ON_THE_SPOT.includes(s) && s !== f.carService ? "emergency" : f.timing,
    }));
  }

  const service = form.carService;
  const onTheSpot = !!service && ON_THE_SPOT.includes(service);
  const asksDrivable = !!service && ASKS_DRIVABLE.includes(service);
  // A car that can't move can't be driven to the garage.
  const places = asksDrivable && form.drivable === false ? PLACES.filter((p) => p !== "bring_to_them") : PLACES;
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
    carService: service ?? undefined,
    issues: service ? form.issues.filter((x) => ISSUES[service].includes(x)) : [],
    carMake: form.carMake || undefined,
    carModel: text(form.carModel),
    carYear: number(form.carYear),
    fuel: form.fuel,
    drivable: asksDrivable && form.drivable !== null ? form.drivable : undefined,
    towTo: service === "towing" ? text(form.towTo) : undefined,
    place: onTheSpot ? "at_location" : form.place || undefined,
    timing: form.timing,
    scheduledAt: form.timing === "scheduled" ? text(form.scheduledAt) : undefined,
    budgetUsd: number(form.budgetUsd),
    jobDescription: text(form.jobDescription),
  };
  const fieldErrors = showErrors ? fieldErrorsFor(carSeekerSchema, payload) : {};
  const progress = requiredProgress(carSeekerSchema, payload);

  async function handleSave() {
    setError(null);

    const parsed = carSeekerSchema.safeParse(payload);
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
          {CAR_SERVICES.map((s) => (
            <button
              type="button"
              key={s}
              onClick={() => pickService(s)}
              className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3.5 text-start transition hover:bg-surface-sunken active:scale-[0.99]"
            >
              <CarServiceIcon service={s} />
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
        <CarServiceIcon service={service} className="h-10 w-10" />
        <p className="min-w-0 flex-1 font-semibold">{tService(service)}</p>
        <button type="button" onClick={() => pickService(null)} className="text-sm font-medium text-primary">
          {t("changeService")}
        </button>
      </div>

      <div className="flex flex-col gap-3">
        <SectionHeading>{t("section1Title")}</SectionHeading>
        {ISSUES[service].length > 0 && (
          <>
            <FieldLabel field="issues" errors={fieldErrors} optional>{t(service === "car_wash" || service === "inspection" ? "issuesWanted" : "issues")}</FieldLabel>
            {pills(
              ISSUES[service],
              (v) => form.issues.includes(v),
              (v) => update("issues", form.issues.includes(v) ? form.issues.filter((x) => x !== v) : [...form.issues, v]),
              (v) => tIssue(v),
            )}
          </>
        )}
        {service === "towing" && (
          <>
            <FieldLabel field="towTo" errors={fieldErrors}>{t("towTo")}</FieldLabel>
            <input className={ui.input} maxLength={120} placeholder={t("towToPlaceholder")} value={form.towTo} onChange={(e) => update("towTo", e.target.value)} />
          </>
        )}
        {asksDrivable && (
          <>
            <FieldLabel field="drivable" errors={fieldErrors} optional>{t("drivable")}</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {([true, false] as const).map((v) => (
                <button
                  type="button"
                  key={String(v)}
                  onClick={() => setForm((f) => ({ ...f, drivable: v, place: !v && f.place === "bring_to_them" ? "" : f.place }))}
                  className={ui.pill(form.drivable === v)}
                >
                  {v ? t("drivableYes") : t("drivableNo")}
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
        <FieldLabel field="carMake" errors={fieldErrors}>{t("carMake")}</FieldLabel>
        <select className={ui.input} value={form.carMake} onChange={(e) => update("carMake", e.target.value)}>
          <option value="">{t("chooseMake")}</option>
          {MAKES.map((m) => (
            <option key={m} value={m}>
              {tMake(m)}
            </option>
          ))}
        </select>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">{t("carModel")}</span>
            <input className={ui.input} maxLength={60} placeholder={t("carModelPlaceholder")} value={form.carModel} onChange={(e) => update("carModel", e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">{t("carYear")}</span>
            <input type="number" inputMode="numeric" min={1950} max={2100} className={ui.input} placeholder="2015" value={form.carYear} onChange={(e) => update("carYear", e.target.value)} />
          </label>
        </div>
        <FieldError field="carYear" errors={fieldErrors} />
        <FieldLabel field="fuel" errors={fieldErrors}>{t("fuel")}</FieldLabel>
        {pills(FUELS, (v) => form.fuel === v, (v) => update("fuel", v), (v) => tOption(`fuel.${v}`))}
      </div>

      <div className="flex flex-col gap-3">
        <SectionHeading>{t("section3Title")}</SectionHeading>
        {!onTheSpot && (
          <>
            <FieldLabel field="place" errors={fieldErrors}>{t("place")}</FieldLabel>
            {pills(places, (v) => form.place === v, (v) => update("place", v), (v) => tOption(`place.${v}`))}
          </>
        )}
        <FieldLabel field="timing" errors={fieldErrors}>{t("timing")}</FieldLabel>
        {pills(TIMINGS, (v) => form.timing === v, (v) => update("timing", v), (v) => tOption(`timing.${v}`))}
        {form.timing === "scheduled" && (
          <>
            <FieldLabel field="scheduledAt" errors={fieldErrors}>{t("scheduledAt")}</FieldLabel>
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
        <p className="-mt-1 text-xs text-muted">{onTheSpot ? t("whereCarHint") : t("addressHint")}</p>
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
