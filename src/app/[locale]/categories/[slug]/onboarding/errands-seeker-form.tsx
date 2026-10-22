"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import EditShell from "@/components/onboarding/edit-shell";
import FieldLabel, { FieldError } from "@/components/onboarding/field-label";
import SectionHeading from "@/components/onboarding/section-heading";
import GenericPhotoField from "@/components/onboarding/generic-photo-field";
import LocationPicker from "@/components/onboarding/location-picker";
import ErrandServiceIcon from "@/components/errand-service-icon";
import { ChevronIcon } from "@/components/home-icons";
import { ERRAND_SERVICES, SEEKER_FIELDS, TIMINGS, errandSeekerSchema, type ErrandService } from "@/lib/validation/errands";
import { ui } from "@/lib/ui";
import { fieldErrorsFor, scrollToFirstError } from "@/lib/form-errors";
import { request } from "@/lib/request";

type Timing = (typeof TIMINGS)[number];

type FormState = {
  fullName: string;
  contactPhone: string;
  locationId: string | null;
  locationDetail: string;
  errandService: ErrandService | null;
  jobDescription: string;
  pickupPlace: string;
  dropoffPlace: string;
  institution: string;
  storeName: string;
  budgetUsd: string;
  expectedWaitHours: string;
  passengers: string;
  timing: Timing;
  scheduledAt: string;
  deadline: string;
  notes: string;
};

const initialState: FormState = {
  fullName: "",
  contactPhone: "",
  locationId: null,
  locationDetail: "",
  errandService: null,
  jobDescription: "",
  pickupPlace: "",
  dropoffPlace: "",
  institution: "",
  storeName: "",
  budgetUsd: "",
  expectedWaitHours: "",
  passengers: "1",
  timing: "asap",
  scheduledAt: "",
  deadline: "",
  notes: "",
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
    errandService: (a.errandService as ErrandService) ?? null,
    jobDescription: str(a.jobDescription),
    pickupPlace: str(a.pickupPlace),
    dropoffPlace: str(a.dropoffPlace),
    institution: str(a.institution),
    storeName: str(a.storeName),
    budgetUsd: num(a.budgetUsd),
    expectedWaitHours: num(a.expectedWaitHours),
    passengers: num(a.passengers) || "1",
    timing: a.timing === "scheduled" ? "scheduled" : "asap",
    scheduledAt: str(a.scheduledAt),
    deadline: str(a.deadline),
    notes: str(a.notes),
  };
}

/**
 * A Delivery & Errands request. First the five services as a list (the
 * category's "what do you need?" screen), then only the questions that
 * service needs -- pickup and drop-off for a delivery, the office for
 * paperwork, and so on.
 */
export default function ErrandsSeekerForm({
  categorySlug,
  initialProfile,
  onBack,
}: {
  categorySlug: string;
  initialProfile: ExistingProfile | null;
  onBack?: () => void;
}) {
  const t = useTranslations("ErrandsSeekerOnboarding");
  const tw = useTranslations("Wizard");
  const tService = useTranslations("ErrandServices");
  const tTiming = useTranslations("ErrandTiming");
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
  // Set by the first failed save; from then on errors update live as the
  // fields are fixed.
  const [showErrors, setShowErrors] = useState(false);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const service = form.errandService;
  const asks = (field: (typeof SEEKER_FIELDS)[ErrandService][number]) => !!service && SEEKER_FIELDS[service].includes(field);
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
    errandService: service ?? undefined,
    jobDescription: form.jobDescription,
    pickupPlace: asks("pickupPlace") ? text(form.pickupPlace) : undefined,
    dropoffPlace: asks("dropoffPlace") ? text(form.dropoffPlace) : undefined,
    institution: asks("institution") ? text(form.institution) : undefined,
    storeName: asks("storeName") ? text(form.storeName) : undefined,
    budgetUsd: asks("budgetUsd") ? number(form.budgetUsd) : undefined,
    expectedWaitHours: asks("expectedWaitHours") ? number(form.expectedWaitHours) : undefined,
    passengers: asks("passengers") ? number(form.passengers) : undefined,
    timing: form.timing,
    scheduledAt: form.timing === "scheduled" ? text(form.scheduledAt) : undefined,
    deadline: asks("deadline") ? text(form.deadline) : undefined,
    notes: text(form.notes),
  };
  const fieldErrors = showErrors ? fieldErrorsFor(errandSeekerSchema, payload) : {};

  async function handleSave() {
    setError(null);

    const parsed = errandSeekerSchema.safeParse(payload);
    if (!parsed.success) {
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

    router.push(`/categories/${categorySlug}/dashboard`);
    router.refresh();
  }

  // Step one: which service.
  if (!service) {
    return (
      <EditShell
        title={t("pickTitle")}
        onCancel={() => router.push(`/categories/${categorySlug}/dashboard`)}
        onBack={onBack}
        backLabel={tw("changeRole")}
      >
        <div className="flex flex-col gap-2.5">
          <p className="text-sm text-muted">{t("pickSubtitle")}</p>
          {ERRAND_SERVICES.map((s) => (
            <button
              type="button"
              key={s}
              onClick={() => update("errandService", s)}
              className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3.5 text-start transition hover:bg-surface-sunken active:scale-[0.99]"
            >
              <ErrandServiceIcon service={s} />
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

  const placeInput = (key: "pickupPlace" | "dropoffPlace", label: string) => (
    <>
      <FieldLabel field={key} errors={fieldErrors}>{label}</FieldLabel>
      <input className={ui.input} maxLength={160} placeholder={t("placePlaceholder")} value={form[key]} onChange={(e) => update(key, e.target.value)} />
    </>
  );

  return (
    <EditShell
      title={isRealEdit ? t("editTitle") : t("createTitle")}
      error={error ?? (Object.keys(fieldErrors).length > 0 ? tw("fixHighlighted") : null)}
      onCancel={() => router.push(`/categories/${categorySlug}/dashboard`)}
      onSave={handleSave}
      onBack={onBack}
      backLabel={tw("changeRole")}
      submitting={submitting}
    >
      <div className="flex items-center gap-3 rounded-2xl bg-surface-sunken p-3">
        <ErrandServiceIcon service={service} className="h-10 w-10" />
        <p className="min-w-0 flex-1 font-semibold">{tService(service)}</p>
        <button type="button" onClick={() => update("errandService", null)} className="text-sm font-medium text-primary">
          {t("changeService")}
        </button>
      </div>

      <div className="flex flex-col gap-3">
        <SectionHeading>{t("section1Title")}</SectionHeading>
        <FieldLabel field="jobDescription" errors={fieldErrors}>{t(`${service}.what`)}</FieldLabel>
        <textarea className={ui.input} rows={3} maxLength={1000} placeholder={t(`${service}.whatPlaceholder`)} value={form.jobDescription} onChange={(e) => update("jobDescription", e.target.value)} />

        {asks("institution") && (
          <>
            <FieldLabel field="institution" errors={fieldErrors}>{t("institution")}</FieldLabel>
            <input className={ui.input} maxLength={160} placeholder={t("institutionPlaceholder")} value={form.institution} onChange={(e) => update("institution", e.target.value)} />
          </>
        )}
        {asks("storeName") && (
          <>
            <FieldLabel field="storeName" errors={fieldErrors} optional>{t("storeName")}</FieldLabel>
            <input className={ui.input} maxLength={160} placeholder={t("storeNamePlaceholder")} value={form.storeName} onChange={(e) => update("storeName", e.target.value)} />
          </>
        )}
        {asks("budgetUsd") && (
          <>
            <FieldLabel field="budgetUsd" errors={fieldErrors} optional>{t("budgetUsd")}</FieldLabel>
            <input type="number" inputMode="decimal" min={0} className={ui.input} value={form.budgetUsd} onChange={(e) => update("budgetUsd", e.target.value)} />
          </>
        )}
        {asks("pickupPlace") && placeInput("pickupPlace", t(`${service}.pickup`))}
        {asks("dropoffPlace") && placeInput("dropoffPlace", t(`${service}.dropoff`))}
        {(asks("pickupPlace") || asks("dropoffPlace")) && <p className="-mt-1 text-xs text-muted">{t("placeHint")}</p>}
        {asks("expectedWaitHours") && (
          <>
            <FieldLabel field="expectedWaitHours" errors={fieldErrors} optional>{t("expectedWaitHours")}</FieldLabel>
            <input type="number" inputMode="decimal" min={0.5} max={24} step={0.5} className={ui.input} value={form.expectedWaitHours} onChange={(e) => update("expectedWaitHours", e.target.value)} />
          </>
        )}
        {asks("passengers") && (
          <>
            <FieldLabel field="passengers" errors={fieldErrors}>{t("passengers")}</FieldLabel>
            <div className="flex gap-2">
              {["1", "2"].map((n) => (
                <button type="button" key={n} onClick={() => update("passengers", n)} className={ui.pill(form.passengers === n)}>
                  {n}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <SectionHeading>{t("section2Title")}</SectionHeading>
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
        {asks("deadline") && (
          <>
            <FieldLabel field="deadline" errors={fieldErrors} optional>{t("deadline")}</FieldLabel>
            <input type="date" className={ui.input} min={new Date().toISOString().slice(0, 10)} value={form.deadline} onChange={(e) => update("deadline", e.target.value)} />
          </>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <SectionHeading>{t("section3Title")}</SectionHeading>
        <input className={ui.input} placeholder={t("namePlaceholder")} value={form.fullName} onChange={(e) => update("fullName", e.target.value)} />
        <FieldError field="fullName" errors={fieldErrors} />
        <input type="tel" className={ui.input} placeholder={t("contactPhonePlaceholder")} value={form.contactPhone} onChange={(e) => update("contactPhone", e.target.value)} />
        <FieldError field="contactPhone" errors={fieldErrors} />
        <p className="-mt-1 text-xs text-muted">{tw("phoneHint")}</p>
        {initialProfile && (
          <GenericPhotoField profileId={initialProfile.id} value={photoUrl} onChange={setPhotoUrl} onError={setError} />
        )}
        <LocationPicker
          governorateId={form.locationId}
          detail={form.locationDetail}
          onGovernorate={(id) => update("locationId", id)}
          onDetail={(v) => update("locationDetail", v)}
          errors={fieldErrors}
        />
        <FieldLabel field="notes" errors={fieldErrors} optional>{t("notes")}</FieldLabel>
        <textarea className={ui.input} rows={2} maxLength={500} placeholder={t("notesPlaceholder")} value={form.notes} onChange={(e) => update("notes", e.target.value)} />
      </div>
    </EditShell>
  );
}
