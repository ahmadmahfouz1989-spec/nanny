"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import EditShell from "@/components/onboarding/edit-shell";
import FieldLabel, { FieldError } from "@/components/onboarding/field-label";
import SectionHeading from "@/components/onboarding/section-heading";
import GenericPhotoField from "@/components/onboarding/generic-photo-field";
import LocationPicker from "@/components/onboarding/location-picker";
import { DAYS } from "@/lib/validation/profile";
import { TRADES, URGENCIES, maintenanceSeekerSchema } from "@/lib/validation/maintenance";
import { ui } from "@/lib/ui";
import { fieldErrorsFrom, scrollToFirstError } from "@/lib/form-errors";
import { request } from "@/lib/request";

type Urgency = (typeof URGENCIES)[number];

type FormState = {
  fullName: string;
  contactPhone: string;
  locationId: string | null;
  locationDetail: string;
  tradesNeeded: string[];
  jobDescription: string;
  urgency: Urgency;
  neededDays: string[];
  desiredStartDate: string;
};

const initialState: FormState = {
  fullName: "",
  contactPhone: "",
  locationId: null,
  locationDetail: "",
  tradesNeeded: [],
  jobDescription: "",
  urgency: "this_week",
  neededDays: [],
  desiredStartDate: "",
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
  return {
    // A freshly-claimed draft (see /api/generic-profile/claim) has a
    // placeholder full_name -- show the field empty rather than that.
    fullName: p.status === "draft" ? "" : p.full_name,
    contactPhone: p.contact_phone ?? "",
    locationId: p.location_id,
    locationDetail: (a.locationDetail as string) ?? "",
    tradesNeeded: (a.tradesNeeded as string[]) ?? [],
    jobDescription: (a.jobDescription as string) ?? "",
    urgency: (a.urgency as Urgency) ?? "this_week",
    neededDays: (a.neededDays as string[]) ?? [],
    desiredStartDate: (a.desiredStartDate as string) ?? "",
  };
}

export default function MaintenanceSeekerForm({
  categorySlug,
  initialProfile,
  onBack,
}: {
  categorySlug: string;
  initialProfile: ExistingProfile | null;
  onBack?: () => void;
}) {
  const t = useTranslations("MaintenanceSeekerOnboarding");
  const tw = useTranslations("Wizard");
  const tDays = useTranslations("Days");
  const tTrade = useTranslations("Trades");
  const tUrgency = useTranslations("Urgency");
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

  function toggle(key: "neededDays" | "tradesNeeded", value: string) {
    setForm((f) => ({
      ...f,
      [key]: f[key].includes(value) ? f[key].filter((v) => v !== value) : [...f[key], value],
    }));
  }

  // Days and a start date mean nothing for a job that has to happen now.
  const urgent = form.urgency === "urgent";

  const payload = {
    categorySlug,
    role: "seeker" as const,
    fullName: form.fullName,
    contactPhone: form.contactPhone || undefined,
    locationId: form.locationId,
    locationDetail: form.locationDetail,
    tradesNeeded: form.tradesNeeded,
    jobDescription: form.jobDescription,
    urgency: form.urgency,
    neededDays: urgent ? [] : form.neededDays,
    desiredStartDate: urgent ? undefined : form.desiredStartDate || undefined,
  };
  const fieldErrors = showErrors ? fieldErrorsFrom(maintenanceSeekerSchema.safeParse(payload)) : {};

  async function handleSave() {
    setError(null);

    const parsed = maintenanceSeekerSchema.safeParse(payload);
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
        <LocationPicker
          governorateId={form.locationId}
          detail={form.locationDetail}
          onGovernorate={(id) => update("locationId", id)}
          onDetail={(v) => update("locationDetail", v)}
        />
        <FieldError field="locationId" errors={fieldErrors} />
        <FieldError field="locationDetail" errors={fieldErrors} />
      </div>

      <div className="flex flex-col gap-3">
        <SectionHeading>{t("section2Title")}</SectionHeading>
        <FieldLabel field="tradesNeeded" errors={fieldErrors}>{t("tradesNeeded")}</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {TRADES.map((trade) => (
            <button type="button" key={trade} onClick={() => toggle("tradesNeeded", trade)} className={ui.pill(form.tradesNeeded.includes(trade))}>
              {tTrade(trade)}
            </button>
          ))}
        </div>

        <FieldLabel field="jobDescription" errors={fieldErrors}>{t("jobDescription")}</FieldLabel>
        <textarea className={ui.input} rows={4} maxLength={1000} placeholder={t("jobDescriptionPlaceholder")} value={form.jobDescription} onChange={(e) => update("jobDescription", e.target.value)} />
      </div>

      <div className="flex flex-col gap-3">
        <SectionHeading>{t("section3Title")}</SectionHeading>
        <FieldLabel field="urgency" errors={fieldErrors}>{t("urgency")}</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {URGENCIES.map((u) => (
            <button type="button" key={u} onClick={() => update("urgency", u)} className={ui.pill(form.urgency === u)}>
              {tUrgency(u)}
            </button>
          ))}
        </div>

        {!urgent && (
          <>
            <FieldLabel field="neededDays" errors={fieldErrors} optional>{t("neededDays")}</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((day) => (
                <button type="button" key={day} onClick={() => toggle("neededDays", day)} className={ui.pill(form.neededDays.includes(day))}>
                  {tDays(day)}
                </button>
              ))}
            </div>

            <FieldLabel field="desiredStartDate" errors={fieldErrors} optional>{t("desiredStartDate")}</FieldLabel>
            <input type="date" className={ui.input} min={new Date().toISOString().slice(0, 10)} value={form.desiredStartDate} onChange={(e) => update("desiredStartDate", e.target.value)} />
          </>
        )}
      </div>
    </EditShell>
  );
}
