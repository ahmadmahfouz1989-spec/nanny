"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import EditShell from "@/components/onboarding/edit-shell";
import { useFormDraft } from "@/components/onboarding/use-form-draft";
import FieldLabel, { FieldError } from "@/components/onboarding/field-label";
import SectionHeading from "@/components/onboarding/section-heading";
import GenericPhotoField from "@/components/onboarding/generic-photo-field";
import LocationPicker from "@/components/onboarding/location-picker";
import DistrictCoverage from "@/components/onboarding/district-coverage";
import NationalitySelect from "@/components/onboarding/nationality-select";
import ErrandServiceIcon from "@/components/errand-service-icon";
import IdDocumentField from "@/components/onboarding/id-document-field";
import { DAYS } from "@/lib/validation/profile";
import { ERRAND_SERVICES, PRICING, VEHICLES, errandProviderSchema, type ErrandService } from "@/lib/validation/errands";
import { ui } from "@/lib/ui";
import { fieldErrorsFor, requiredProgress, scrollToFirstError } from "@/lib/form-errors";
import { request } from "@/lib/request";

type Vehicle = (typeof VEHICLES)[number];
type Pricing = (typeof PRICING)[number];

type FormState = {
  fullName: string;
  contactPhone: string;
  locationId: string | null;
  locationDetail: string;
  districtId: string | null;
  areaId: string | null;
  coverDistrictIds: string[];
  nationality: string;
  errandServices: ErrandService[];
  serviceAreaIds: string[];
  availabilityDays: string[];
  startTime: string;
  endTime: string;
  takesUrgentJobs: boolean;
  vehicle: Vehicle | "";
  pricing: Pricing | "";
  priceNote: string;
  canDoMultipleStops: boolean;
  canPayForPurchases: boolean;
  maxWaitHours: string;
  paperworkTypes: string;
  hasDrivingLicense: boolean;
  hasInsurance: boolean;
  hasPassengerHelmet: boolean;
  shortIntro: string;
};

const initialState: FormState = {
  fullName: "",
  contactPhone: "",
  locationId: null,
  locationDetail: "",
  districtId: null,
  areaId: null,
  coverDistrictIds: [],
  nationality: "",
  errandServices: [],
  serviceAreaIds: [],
  availabilityDays: [],
  startTime: "08:00",
  endTime: "20:00",
  takesUrgentJobs: false,
  vehicle: "",
  pricing: "",
  priceNote: "",
  canDoMultipleStops: false,
  canPayForPurchases: false,
  maxWaitHours: "",
  paperworkTypes: "",
  hasDrivingLicense: false,
  hasInsurance: false,
  hasPassengerHelmet: false,
  shortIntro: "",
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
    districtId: (a.districtId as string) ?? null,
    areaId: (a.areaId as string) ?? null,
    coverDistrictIds: (a.coverDistrictIds as string[]) ?? [],
    nationality: (a.nationality as string) ?? "",
    errandServices: (a.errandServices as ErrandService[]) ?? [],
    serviceAreaIds: (a.serviceAreaIds as string[]) ?? [],
    availabilityDays: availability.days ?? [],
    startTime: availability.startTime ?? "08:00",
    endTime: availability.endTime ?? "20:00",
    takesUrgentJobs: !!a.takesUrgentJobs,
    vehicle: (a.vehicle as Vehicle) ?? "",
    pricing: (a.pricing as Pricing) ?? "",
    priceNote: (a.priceNote as string) ?? "",
    canDoMultipleStops: !!a.canDoMultipleStops,
    canPayForPurchases: !!a.canPayForPurchases,
    maxWaitHours: typeof a.maxWaitHours === "number" ? String(a.maxWaitHours) : "",
    paperworkTypes: (a.paperworkTypes as string) ?? "",
    hasDrivingLicense: !!a.hasDrivingLicense,
    hasInsurance: !!a.hasInsurance,
    hasPassengerHelmet: !!a.hasPassengerHelmet,
    shortIntro: (a.shortIntro as string) ?? "",
  };
}

export default function ErrandsProviderForm({
  categorySlug,
  initialProfile,
  onBack,
}: {
  categorySlug: string;
  initialProfile: ExistingProfile | null;
  onBack?: () => void;
}) {
  const t = useTranslations("ErrandsProviderOnboarding");
  const tw = useTranslations("Wizard");
  const tDays = useTranslations("Days");
  const tService = useTranslations("ErrandServices");
  const tVehicle = useTranslations("Vehicles");
  const tPricing = useTranslations("ErrandPricing");
  const router = useRouter();
  const isEdit = !!initialProfile;
  // A claimed-but-unfilled draft still needs PATCH (a row already exists),
  // but should read as "create" to the user, not "edit" -- they haven't
  // submitted anything yet.
  const isRealEdit = isEdit && initialProfile!.status !== "draft";
  const [form, setForm] = useState(initialProfile ? stateFromExisting(initialProfile) : initialState);
  // Answers kept on the phone until saved or cancelled (see useFormDraft).
  const draft = useFormDraft(`form-draft:${categorySlug}:provider:${initialProfile?.id ?? "new"}`, form, setForm);
  const [photoUrl, setPhotoUrl] = useState(initialProfile?.profile_photo_url ?? null);
  // Required: an ID or licence photo, uploaded on its own (see IdDocumentField).
  const [idStatus, setIdStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Set by the first failed save; from then on errors update live as the
  // fields are fixed.
  const [showErrors, setShowErrors] = useState(false);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggle(key: "availabilityDays" | "serviceAreaIds", value: string) {
    setForm((f) => ({
      ...f,
      [key]: f[key].includes(value) ? f[key].filter((v) => v !== value) : [...f[key], value],
    }));
  }

  function toggleService(service: ErrandService) {
    setForm((f) => {
      const on = !f.errandServices.includes(service);
      return {
        ...f,
        errandServices: on ? [...f.errandServices, service] : f.errandServices.filter((s) => s !== service),
        // A moto taxi is a motorcycle -- pick it for them.
        vehicle: on && service === "moto_taxi" ? "motorcycle" : f.vehicle,
      };
    });
  }

  const offers = (s: ErrandService) => form.errandServices.includes(s);
  const motoTaxi = offers("moto_taxi");

  // Only what applies to the services they picked is saved, so unticking
  // a service doesn't leave its answers behind on the profile.
  const payload = {
    categorySlug,
    role: "provider" as const,
    fullName: form.fullName,
    contactPhone: form.contactPhone || undefined,
    locationId: form.locationId,
    locationDetail: form.locationDetail,
    districtId: form.districtId ?? undefined,
    areaId: form.areaId,
    // Your own district counts already.
    coverDistrictIds: form.coverDistrictIds.filter((id) => id !== form.districtId),
    nationality: form.nationality,
    errandServices: form.errandServices,
    // The home governorate is matched on its own -- don't store it twice.
    serviceAreaIds: form.serviceAreaIds.filter((id) => id !== form.locationId),
    availability: { days: form.availabilityDays, startTime: form.startTime, endTime: form.endTime },
    takesUrgentJobs: form.takesUrgentJobs,
    vehicle: form.vehicle || undefined,
    pricing: form.pricing || undefined,
    priceNote: form.priceNote.trim() || undefined,
    canDoMultipleStops: form.canDoMultipleStops,
    canPayForPurchases: offers("shopping") && form.canPayForPurchases,
    maxWaitHours: offers("queue") && form.maxWaitHours !== "" ? Number(form.maxWaitHours) : undefined,
    paperworkTypes: offers("paperwork") ? form.paperworkTypes.trim() || undefined : undefined,
    hasDrivingLicense: motoTaxi && form.hasDrivingLicense,
    hasInsurance: motoTaxi && form.hasInsurance,
    hasPassengerHelmet: motoTaxi && form.hasPassengerHelmet,
    shortIntro: form.shortIntro || undefined,
  };
  const fieldErrors = showErrors ? fieldErrorsFor(errandProviderSchema, payload) : {};
  const progress = requiredProgress(errandProviderSchema, payload);

  async function handleSave() {
    setError(null);

    const parsed = errandProviderSchema.safeParse(payload);
    if (!parsed.success || !idStatus) {
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

    draft.clear();
    router.push(`/categories/${categorySlug}/dashboard`);
    router.refresh();
  }

  const check = (key: "takesUrgentJobs" | "canDoMultipleStops" | "canPayForPurchases" | "hasDrivingLicense" | "hasInsurance" | "hasPassengerHelmet", label: string) => (
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
      saveLabel={isRealEdit ? undefined : tw("submitProfile")}
      error={error ?? (Object.keys(fieldErrors).length > 0 || (showErrors && !idStatus) ? tw("fixHighlighted") : null)}
      onCancel={() => {
        draft.clear();
        router.push(`/categories/${categorySlug}/dashboard`);
      }}
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
        {initialProfile && <IdDocumentField profileId={initialProfile.id} onStatus={setIdStatus} error={showErrors} />}
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
        <DistrictCoverage
          value={form.coverDistrictIds}
          onChange={(ids) => setForm((f) => ({ ...f, coverDistrictIds: ids }))}
          homeDistrictId={form.districtId}
          homeGovernorateId={form.locationId}
        />
        <FieldLabel field="nationality" errors={fieldErrors}>{t("nationality")}</FieldLabel>
        <NationalitySelect value={form.nationality} onChange={(v) => update("nationality", v)} />
      </div>

      <div className="flex flex-col gap-3">
        <SectionHeading>{t("section2Title")}</SectionHeading>
        <FieldLabel field="errandServices" errors={fieldErrors}>{t("services")}</FieldLabel>
        <div className="flex flex-col gap-2">
          {ERRAND_SERVICES.map((s) => (
            <button
              type="button"
              key={s}
              onClick={() => toggleService(s)}
              aria-pressed={offers(s)}
              className={`flex items-center gap-3 rounded-2xl border p-3 text-start transition ${
                offers(s) ? "border-primary bg-primary-soft/40" : "border-border bg-surface hover:bg-surface-sunken"
              }`}
            >
              <ErrandServiceIcon service={s} className="h-10 w-10" />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-ink">{tService(s)}</span>
                <span className="block text-xs text-muted">{tService(`${s}Provider`)}</span>
              </span>
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${offers(s) ? "border-primary bg-primary text-white" : "border-border-strong"}`}>
                {offers(s) && (
                  <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
                    <path d="m3.5 8.5 3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
            </button>
          ))}
        </div>

        <FieldLabel field="vehicle" errors={fieldErrors} optional={!form.errandServices.some((s) => s !== "paperwork" && s !== "queue")}>
          {t("vehicle")}
        </FieldLabel>
        <div className="flex flex-wrap gap-2">
          {VEHICLES.map((v) => (
            <button type="button" key={v} onClick={() => update("vehicle", form.vehicle === v ? "" : v)} className={ui.pill(form.vehicle === v)}>
              {tVehicle(v)}
            </button>
          ))}
        </div>
        {motoTaxi && <p className="-mt-1 text-xs text-muted">{t("motoTaxiNeedsMotorcycle")}</p>}

        {offers("paperwork") && (
          <>
            <FieldLabel field="paperworkTypes" errors={fieldErrors} optional>{t("paperworkTypes")}</FieldLabel>
            <input className={ui.input} placeholder={t("paperworkTypesPlaceholder")} value={form.paperworkTypes} onChange={(e) => update("paperworkTypes", e.target.value)} />
          </>
        )}

        {offers("queue") && (
          <>
            <FieldLabel field="maxWaitHours" errors={fieldErrors}>{t("maxWaitHours")}</FieldLabel>
            <input type="number" inputMode="decimal" min={0.5} max={24} step={0.5} className={ui.input} value={form.maxWaitHours} onChange={(e) => update("maxWaitHours", e.target.value)} />
          </>
        )}

        {motoTaxi && (
          <div className="flex flex-col gap-2 rounded-2xl bg-surface-sunken p-3">
            <p className="text-sm font-semibold">{t("motoTaxiTitle")}</p>
            {check("hasDrivingLicense", t("hasDrivingLicense"))}
            <FieldError field="hasDrivingLicense" errors={fieldErrors} />
            {check("hasInsurance", t("hasInsurance"))}
            {check("hasPassengerHelmet", t("hasPassengerHelmet"))}
          </div>
        )}

        <p className={ui.label}>{t("extras")}</p>
        {check("canDoMultipleStops", t("canDoMultipleStops"))}
        {offers("shopping") && check("canPayForPurchases", t("canPayForPurchases"))}
      </div>

      <div className="flex flex-col gap-3">
        <SectionHeading>{t("section3Title")}</SectionHeading>
        {/* Where else they work is the district list under their location. */}

        <FieldLabel field="availability" errors={fieldErrors}>{t("availableDays")}</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((day) => (
            <button type="button" key={day} onClick={() => toggle("availabilityDays", day)} className={ui.pill(form.availabilityDays.includes(day))}>
              {tDays(day)}
            </button>
          ))}
        </div>

        {check("takesUrgentJobs", t("takesUrgentJobs"))}
      </div>

      <div className="flex flex-col gap-3">
        <SectionHeading>{t("section4Title")}</SectionHeading>
        <FieldLabel field="pricing" errors={fieldErrors}>{t("pricing")}</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {PRICING.map((p) => (
            <button type="button" key={p} onClick={() => update("pricing", p)} className={ui.pill(form.pricing === p)}>
              {tPricing(p)}
            </button>
          ))}
        </div>
        <FieldLabel field="priceNote" errors={fieldErrors} optional>{t("priceNote")}</FieldLabel>
        <input className={ui.input} maxLength={120} placeholder={t("priceNotePlaceholder")} value={form.priceNote} onChange={(e) => update("priceNote", e.target.value)} />

        <FieldLabel field="shortIntro" errors={fieldErrors} optional>{t("shortIntro")}</FieldLabel>
        <textarea className={ui.input} rows={4} maxLength={500} placeholder={t("shortIntroPlaceholder")} value={form.shortIntro} onChange={(e) => update("shortIntro", e.target.value)} />
      </div>
    </EditShell>
  );
}
