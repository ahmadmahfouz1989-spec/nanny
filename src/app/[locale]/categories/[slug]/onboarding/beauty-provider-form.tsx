"use client";

import { useState } from "react";
import { initialFullName } from "@/lib/draft-profile";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import EditShell from "@/components/onboarding/edit-shell";
import { useFormDraft } from "@/components/onboarding/use-form-draft";
import FieldLabel, { FieldError } from "@/components/onboarding/field-label";
import SectionHeading from "@/components/onboarding/section-heading";
import GenericPhotoField from "@/components/onboarding/generic-photo-field";
import LocationPicker from "@/components/onboarding/location-picker";
import DistrictCoverage from "@/components/onboarding/district-coverage";
import LanguageSelect from "@/components/onboarding/language-select";
import BeautyServiceIcon from "@/components/beauty-service-icon";
import IdDocumentField from "@/components/onboarding/id-document-field";
import { DAYS } from "@/lib/validation/profile";
import {
  BEAUTY_SERVICES,
  GENDERS,
  PRICING,
  PROVIDER_TYPES,
  SERVES,
  TREATMENTS,
  WORKPLACES,
  beautyProviderSchema,
  type BeautyProviderType,
  type BeautyService,
  type Gender,
} from "@/lib/validation/beauty";
import { ui } from "@/lib/ui";
import { fieldErrorsFor, requiredProgress, scrollToFirstError } from "@/lib/form-errors";
import { request } from "@/lib/request";

type Pricing = (typeof PRICING)[number];

type FormState = {
  providerType: BeautyProviderType | "";
  fullName: string;
  teamSize: string;
  gender: Gender | "";
  contactPhone: string;
  locationId: string | null;
  locationDetail: string;
  districtId: string | null;
  areaId: string | null;
  coverDistrictIds: string[];
  beautyServices: BeautyService[];
  treatments: string[];
  serves: string[];
  workplaces: string[];
  certified: boolean;
  bringsKit: boolean;
  chargesTravel: boolean;
  availabilityDays: string[];
  startTime: string;
  endTime: string;
  takesUrgentJobs: boolean;
  yearsExperience: string;
  languageIds: string[];
  pricing: Pricing | "";
  priceFromUsd: string;
  priceNote: string;
  shortIntro: string;
};

const initialState: FormState = {
  providerType: "",
  fullName: "",
  teamSize: "",
  gender: "",
  contactPhone: "",
  locationId: null,
  locationDetail: "",
  districtId: null,
  areaId: null,
  coverDistrictIds: [],
  beautyServices: [],
  treatments: [],
  serves: [],
  workplaces: [],
  certified: false,
  bringsKit: false,
  chargesTravel: false,
  availabilityDays: [],
  startTime: "09:00",
  endTime: "19:00",
  takesUrgentJobs: false,
  yearsExperience: "",
  languageIds: [],
  pricing: "",
  priceFromUsd: "",
  priceNote: "",
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

const num = (v: unknown) => (typeof v === "number" ? String(v) : "");

function stateFromExisting(p: ExistingProfile): FormState {
  const a = p.attributes;
  const availability = (a.availability as { days?: string[]; startTime?: string; endTime?: string }) ?? {};
  return {
    providerType: (a.providerType as BeautyProviderType) ?? "",
    // A freshly-claimed draft (see /api/generic-profile/claim) has a
    // placeholder full_name -- show the field empty rather than that.
    fullName: initialFullName(p),
    teamSize: num(a.teamSize),
    gender: (a.gender as Gender) ?? "",
    contactPhone: p.contact_phone ?? "",
    locationId: p.location_id,
    locationDetail: (a.locationDetail as string) ?? "",
    districtId: (a.districtId as string) ?? null,
    areaId: (a.areaId as string) ?? null,
    coverDistrictIds: (a.coverDistrictIds as string[]) ?? [],
    beautyServices: (a.beautyServices as BeautyService[]) ?? [],
    treatments: (a.treatments as string[]) ?? [],
    serves: (a.serves as string[]) ?? [],
    workplaces: (a.workplaces as string[]) ?? [],
    certified: !!a.certified,
    bringsKit: !!a.bringsKit,
    chargesTravel: !!a.chargesTravel,
    availabilityDays: availability.days ?? [],
    startTime: availability.startTime ?? "09:00",
    endTime: availability.endTime ?? "19:00",
    takesUrgentJobs: !!a.takesUrgentJobs,
    yearsExperience: num(a.yearsExperience),
    languageIds: (a.languageIds as string[]) ?? [],
    pricing: (a.pricing as Pricing) ?? "",
    priceFromUsd: num(a.priceFromUsd),
    priceNote: (a.priceNote as string) ?? "",
    shortIntro: (a.shortIntro as string) ?? "",
  };
}

/**
 * A beauty & wellness profile: one person, a team or a salon. A team or
 * salon goes by its own name (and its logo as the photo), so the rest of
 * the app needs nothing special for them. Inside each service they tick
 * the treatments they do, which is what requests are matched on.
 */
export default function BeautyProviderForm({
  categorySlug,
  initialProfile,
  onBack,
}: {
  categorySlug: string;
  initialProfile: ExistingProfile | null;
  onBack?: () => void;
}) {
  const t = useTranslations("BeautyProviderOnboarding");
  const tw = useTranslations("Wizard");
  const tDays = useTranslations("Days");
  const tService = useTranslations("BeautyServices");
  const tTreatment = useTranslations("BeautyTreatments");
  const tOption = useTranslations("BeautyOptions");
  const router = useRouter();
  const isEdit = !!initialProfile;
  // A claimed-but-unfilled draft still needs PATCH (a row already exists),
  // but should read as "create" to the user -- they haven't submitted anything yet.
  const isRealEdit = isEdit && initialProfile!.status !== "draft";
  const [form, setForm] = useState(initialProfile ? stateFromExisting(initialProfile) : initialState);
  // Answers kept on the phone until saved or cancelled (see useFormDraft).
  const draft = useFormDraft(`form-draft:${categorySlug}:provider:${initialProfile?.id ?? "new"}`, form, setForm);
  const [photoUrl, setPhotoUrl] = useState(initialProfile?.profile_photo_url ?? null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Set by the first failed save; from then on errors update live as the fields are fixed.
  const [showErrors, setShowErrors] = useState(false);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggle<K extends "availabilityDays" | "treatments" | "serves" | "workplaces" | "beautyServices">(key: K, value: string) {
    setForm((f) => {
      const list = f[key] as string[];
      return { ...f, [key]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value] };
    });
  }

  function pickType(type: BeautyProviderType) {
    setForm((f) => ({
      ...f,
      providerType: type,
      // One person is a woman or a man; "both" is only for a team or salon.
      gender: type === "individual" && f.gender === "mixed" ? "" : f.gender,
      // A salon works at its salon -- ticked for them, still changeable.
      workplaces: type === "salon" && f.workplaces.length === 0 ? ["salon"] : f.workplaces,
    }));
  }

  const business = form.providerType === "team" || form.providerType === "salon";
  const offers = (s: BeautyService) => form.beautyServices.includes(s);
  const visits = form.workplaces.includes("client_home");
  const number = (v: string) => (v === "" ? undefined : Number(v));
  const genders = form.providerType === "individual" ? GENDERS.filter((g) => g !== "mixed") : GENDERS;

  const payload = {
    categorySlug,
    role: "provider" as const,
    fullName: form.fullName,
    contactPhone: form.contactPhone || undefined,
    locationId: form.locationId,
    locationDetail: form.locationDetail,
    districtId: form.districtId ?? undefined,
    areaId: form.areaId,
    // Your own district counts already; the rest only matter to someone who travels.
    coverDistrictIds: visits ? form.coverDistrictIds.filter((id) => id !== form.districtId) : [],
    providerType: form.providerType || undefined,
    teamSize: business ? number(form.teamSize) : undefined,
    gender: form.gender || undefined,
    serves: form.serves,
    workplaces: form.workplaces,
    beautyServices: form.beautyServices,
    // Only the treatments of services still ticked.
    treatments: form.treatments.filter((x) => form.beautyServices.some((s) => TREATMENTS[s].includes(x))),
    certified: form.certified,
    bringsKit: visits && form.bringsKit,
    chargesTravel: visits && form.chargesTravel,
    availability: { days: form.availabilityDays, startTime: form.startTime, endTime: form.endTime },
    takesUrgentJobs: form.takesUrgentJobs,
    yearsExperience: number(form.yearsExperience),
    languageIds: form.languageIds,
    pricing: form.pricing || undefined,
    priceFromUsd: form.pricing && form.pricing !== "quote" ? number(form.priceFromUsd) : undefined,
    priceNote: form.priceNote.trim() || undefined,
    shortIntro: form.shortIntro || undefined,
  };
  const fieldErrors = showErrors ? fieldErrorsFor(beautyProviderSchema, payload) : {};
  const progress = requiredProgress(beautyProviderSchema, payload);

  async function handleSave() {
    setError(null);

    const parsed = beautyProviderSchema.safeParse(payload);
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

    draft.clear();
    router.push(`/categories/${categorySlug}/dashboard`);
    router.refresh();
  }

  const check = (key: "certified" | "bringsKit" | "chargesTravel" | "takesUrgentJobs", label: string) => (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={form[key]} onChange={(e) => update(key, e.target.checked)} className="accent-primary" />
      {label}
    </label>
  );
  const pills = (key: "serves" | "workplaces", values: readonly string[], group: string) => (
    <div className="flex flex-wrap gap-2">
      {values.map((v) => (
        <button type="button" key={v} onClick={() => toggle(key, v)} aria-pressed={form[key].includes(v)} className={ui.pill(form[key].includes(v))}>
          {tOption(`${group}.${v}`)}
        </button>
      ))}
    </div>
  );

  return (
    <EditShell
      progress={progress}
      restored={draft.restored}
      title={isRealEdit ? t("editTitle") : t("createTitle")}
      saveLabel={isRealEdit ? undefined : tw("submitProfile")}
      error={error ?? (Object.keys(fieldErrors).length > 0 ? tw("fixHighlighted") : null)}
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
        <FieldLabel field="providerType" errors={fieldErrors}>{t("providerType")}</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {PROVIDER_TYPES.map((v) => (
            <button type="button" key={v} onClick={() => pickType(v)} aria-pressed={form.providerType === v} className={ui.pill(form.providerType === v)}>
              {tOption(`providerType.${v}`)}
            </button>
          ))}
        </div>
        <input
          className={ui.input}
          placeholder={business ? t("businessNamePlaceholder") : t("namePlaceholder")}
          value={form.fullName}
          onChange={(e) => update("fullName", e.target.value)}
        />
        <FieldError field="fullName" errors={fieldErrors} />
        {business && (
          <>
            <FieldLabel field="teamSize" errors={fieldErrors} optional={form.providerType === "salon"}>{t("teamSize")}</FieldLabel>
            <input type="number" inputMode="numeric" min={2} max={100} className={ui.input} value={form.teamSize} onChange={(e) => update("teamSize", e.target.value)} />
          </>
        )}
        {form.providerType && (
          <>
            <FieldLabel field="gender" errors={fieldErrors}>{business ? t("teamGender") : t("gender")}</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {genders.map((g) => (
                <button type="button" key={g} onClick={() => update("gender", g)} aria-pressed={form.gender === g} className={ui.pill(form.gender === g)}>
                  {tOption(`${business ? "teamGender" : "gender"}.${g}`)}
                </button>
              ))}
            </div>
          </>
        )}
        <input type="tel" autoComplete="tel" className={ui.input} aria-label={t("contactPhonePlaceholder")} placeholder={t("contactPhonePlaceholder")} value={form.contactPhone} onChange={(e) => update("contactPhone", e.target.value)} />
        <FieldError field="contactPhone" errors={fieldErrors} />
        <p className="-mt-1 text-xs text-muted">{tw("phoneHint")}</p>
        {initialProfile && (
          <>
            <GenericPhotoField profileId={initialProfile.id} value={photoUrl} onChange={setPhotoUrl} onError={setError} />
            {business && <p className="-mt-1 text-xs text-muted">{t("logoHint")}</p>}
          </>
        )}
        {/* Optional: a checked ID shows as "ID checked" on the profile. */}
        {initialProfile && <IdDocumentField profileId={initialProfile.id} onStatus={() => {}} optional />}
        <FieldLabel field="languageIds" errors={fieldErrors} optional>{t("languages")}</FieldLabel>
        <LanguageSelect value={form.languageIds} onChange={(ids) => update("languageIds", ids)} />
      </div>

      <div className="flex flex-col gap-3">
        <SectionHeading>{t("section2Title")}</SectionHeading>
        <FieldLabel field="beautyServices" errors={fieldErrors}>{t("services")}</FieldLabel>
        <div className="flex flex-col gap-2">
          {BEAUTY_SERVICES.map((s) => (
            <div key={s} className={`rounded-2xl border transition ${offers(s) ? "border-primary bg-primary-soft/40" : "border-border bg-surface"}`}>
              <button type="button" onClick={() => toggle("beautyServices", s)} aria-pressed={offers(s)} className="flex w-full items-center gap-3 p-3 text-start">
                <BeautyServiceIcon service={s} className="h-10 w-10" />
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
              {/* What exactly they do inside the service -- what requests are matched on. */}
              {offers(s) && TREATMENTS[s].length > 0 && (
                <div className="flex flex-col gap-2 px-3 pb-3">
                  <p className="text-xs text-muted">{t("treatmentsHint")}</p>
                  <div className="flex flex-wrap gap-2">
                    {TREATMENTS[s].map((x) => (
                      <button type="button" key={x} onClick={() => toggle("treatments", x)} aria-pressed={form.treatments.includes(x)} className={ui.pill(form.treatments.includes(x))}>
                        {tTreatment(x)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
        {offers("massage") && <p className="-mt-1 text-xs text-muted">{t("massageNote")}</p>}

        <FieldLabel field="serves" errors={fieldErrors}>{t("serves")}</FieldLabel>
        {pills("serves", SERVES, "serves")}
        {check("certified", t("certified"))}
        <FieldLabel field="yearsExperience" errors={fieldErrors}>{t("yearsExperience")}</FieldLabel>
        <input type="number" inputMode="numeric" min={0} max={60} className={ui.input} value={form.yearsExperience} onChange={(e) => update("yearsExperience", e.target.value)} />
      </div>

      <div className="flex flex-col gap-3">
        <SectionHeading>{t("section3Title")}</SectionHeading>
        <FieldLabel field="workplaces" errors={fieldErrors}>{t("workplaces")}</FieldLabel>
        {pills("workplaces", WORKPLACES, "workplaces")}
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
        {visits && (
          <>
            <DistrictCoverage
              value={form.coverDistrictIds}
              onChange={(ids) => setForm((f) => ({ ...f, coverDistrictIds: ids }))}
              homeDistrictId={form.districtId}
              homeGovernorateId={form.locationId}
            />
            {check("bringsKit", t("bringsKit"))}
            {check("chargesTravel", t("chargesTravel"))}
          </>
        )}
        <FieldLabel field="availability" errors={fieldErrors}>{t("availableDays")}</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((day) => (
            <button type="button" key={day} onClick={() => toggle("availabilityDays", day)} aria-pressed={form.availabilityDays.includes(day)} className={ui.pill(form.availabilityDays.includes(day))}>
              {tDays(day)}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">{t("from")}</span>
            <input type="time" className={ui.input} value={form.startTime} onChange={(e) => update("startTime", e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">{t("to")}</span>
            <input type="time" className={ui.input} value={form.endTime} onChange={(e) => update("endTime", e.target.value)} />
          </label>
        </div>
        {check("takesUrgentJobs", t("takesUrgentJobs"))}
      </div>

      <div className="flex flex-col gap-3">
        <SectionHeading>{t("section4Title")}</SectionHeading>
        <FieldLabel field="pricing" errors={fieldErrors}>{t("pricing")}</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {PRICING.map((p) => (
            <button type="button" key={p} onClick={() => update("pricing", p)} aria-pressed={form.pricing === p} className={ui.pill(form.pricing === p)}>
              {tOption(`pricing.${p}`)}
            </button>
          ))}
        </div>
        {form.pricing && form.pricing !== "quote" && (
          <>
            <FieldLabel field="priceFromUsd" errors={fieldErrors} optional>{t(`priceFrom.${form.pricing}`)}</FieldLabel>
            <input type="number" inputMode="decimal" min={1} className={ui.input} value={form.priceFromUsd} onChange={(e) => update("priceFromUsd", e.target.value)} />
          </>
        )}
        <FieldLabel field="priceNote" errors={fieldErrors} optional>{t("priceNote")}</FieldLabel>
        <input className={ui.input} maxLength={160} placeholder={t("priceNotePlaceholder")} value={form.priceNote} onChange={(e) => update("priceNote", e.target.value)} />

        <FieldLabel field="shortIntro" errors={fieldErrors} optional>{t("shortIntro")}</FieldLabel>
        <textarea className={ui.input} rows={4} maxLength={500} placeholder={t("shortIntroPlaceholder")} value={form.shortIntro} onChange={(e) => update("shortIntro", e.target.value)} />
        <p className="text-xs text-muted">{t("photosHint")}</p>
      </div>
    </EditShell>
  );
}
