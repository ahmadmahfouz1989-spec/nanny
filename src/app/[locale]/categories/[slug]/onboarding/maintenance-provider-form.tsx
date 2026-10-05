"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import EditShell from "@/components/onboarding/edit-shell";
import SectionHeading from "@/components/onboarding/section-heading";
import GenericPhotoField from "@/components/onboarding/generic-photo-field";
import LocationPicker from "@/components/onboarding/location-picker";
import NationalitySelect from "@/components/onboarding/nationality-select";
import { useGovernorates, governorateName } from "@/components/onboarding/use-governorates";
import { DAYS } from "@/lib/validation/profile";
import { TRADES, maintenanceProviderSchema } from "@/lib/validation/maintenance";
import { ui } from "@/lib/ui";

type FormState = {
  fullName: string;
  contactPhone: string;
  locationId: string | null;
  locationDetail: string;
  nationality: string;
  trades: string[];
  serviceAreaIds: string[];
  availabilityDays: string[];
  startTime: string;
  endTime: string;
  yearsExperience: number;
  takesUrgentJobs: boolean;
  shortIntro: string;
};

const initialState: FormState = {
  fullName: "",
  contactPhone: "",
  locationId: null,
  locationDetail: "",
  nationality: "",
  trades: [],
  serviceAreaIds: [],
  availabilityDays: [],
  startTime: "08:00",
  endTime: "18:00",
  yearsExperience: 0,
  takesUrgentJobs: false,
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
    nationality: (a.nationality as string) ?? "",
    trades: (a.trades as string[]) ?? [],
    serviceAreaIds: (a.serviceAreaIds as string[]) ?? [],
    availabilityDays: availability.days ?? [],
    startTime: availability.startTime ?? "08:00",
    endTime: availability.endTime ?? "18:00",
    yearsExperience: (a.yearsExperience as number) ?? 0,
    takesUrgentJobs: !!a.takesUrgentJobs,
    shortIntro: (a.shortIntro as string) ?? "",
  };
}

export default function MaintenanceProviderForm({
  categorySlug,
  initialProfile,
  onBack,
}: {
  categorySlug: string;
  initialProfile: ExistingProfile | null;
  onBack?: () => void;
}) {
  const t = useTranslations("MaintenanceProviderOnboarding");
  const tw = useTranslations("Wizard");
  const tDays = useTranslations("Days");
  const tTrade = useTranslations("Trades");
  const locale = useLocale();
  const governorates = useGovernorates();
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

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggle(key: "availabilityDays" | "trades" | "serviceAreaIds", value: string) {
    setForm((f) => ({
      ...f,
      [key]: f[key].includes(value) ? f[key].filter((v) => v !== value) : [...f[key], value],
    }));
  }

  async function handleSave() {
    setError(null);
    const payload = {
      categorySlug,
      role: "provider" as const,
      fullName: form.fullName,
      contactPhone: form.contactPhone || undefined,
      locationId: form.locationId,
      locationDetail: form.locationDetail,
      nationality: form.nationality,
      trades: form.trades,
      // The home governorate is matched on its own -- don't store it twice.
      serviceAreaIds: form.serviceAreaIds.filter((id) => id !== form.locationId),
      availability: { days: form.availabilityDays, startTime: form.startTime, endTime: form.endTime },
      yearsExperience: form.yearsExperience,
      takesUrgentJobs: form.takesUrgentJobs,
      shortIntro: form.shortIntro || undefined,
    };

    const parsed = maintenanceProviderSchema.safeParse(payload);
    if (!parsed.success) {
      const msgs = [...new Set(parsed.error.issues.map((i) => i.message))];
      setError(msgs.length ? msgs.join(", ") : tw("validationError"));
      return;
    }

    setSubmitting(true);
    const res = await fetch("/api/generic-profile", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, profilePhotoUrl: photoUrl ?? undefined }),
    });
    setSubmitting(false);

    if (!res.ok) {
      setError(tw("genericError"));
      return;
    }

    router.push(`/categories/${categorySlug}/dashboard`);
    router.refresh();
  }

  return (
    <EditShell
      title={isRealEdit ? t("editTitle") : t("createTitle")}
      error={error}
      onCancel={() => router.push(`/categories/${categorySlug}/dashboard`)}
      onSave={handleSave}
      onBack={onBack}
      backLabel={tw("changeRole")}
      submitting={submitting}
    >
      <div className="flex flex-col gap-3">
        <SectionHeading>{t("section1Title")}</SectionHeading>
        <input className={ui.input} placeholder={t("namePlaceholder")} value={form.fullName} onChange={(e) => update("fullName", e.target.value)} />
        <input type="tel" className={ui.input} placeholder={t("contactPhonePlaceholder")} value={form.contactPhone} onChange={(e) => update("contactPhone", e.target.value)} />
        {initialProfile && (
          <GenericPhotoField profileId={initialProfile.id} value={photoUrl} onChange={setPhotoUrl} onError={setError} />
        )}
        <LocationPicker
          governorateId={form.locationId}
          detail={form.locationDetail}
          onGovernorate={(id) => update("locationId", id)}
          onDetail={(v) => update("locationDetail", v)}
        />
        <label className={ui.label}>{t("nationality")}</label>
        <NationalitySelect value={form.nationality} onChange={(v) => update("nationality", v)} />
      </div>

      <div className="flex flex-col gap-3">
        <SectionHeading>{t("section2Title")}</SectionHeading>
        <label className={ui.label}>{t("trades")}</label>
        <div className="flex flex-wrap gap-2">
          {TRADES.map((trade) => (
            <button type="button" key={trade} onClick={() => toggle("trades", trade)} className={ui.pill(form.trades.includes(trade))}>
              {tTrade(trade)}
            </button>
          ))}
        </div>

        <label className={ui.label}>{t("yearsExperience")}</label>
        <input type="number" min={0} step={1} className={ui.input} value={form.yearsExperience} onChange={(e) => update("yearsExperience", Number(e.target.value))} />
      </div>

      <div className="flex flex-col gap-3">
        <SectionHeading>{t("section3Title")}</SectionHeading>
        <label className={ui.label}>{t("serviceAreas")}</label>
        <p className="text-xs text-muted -mt-1">{t("serviceAreasHint")}</p>
        <div className="flex flex-wrap gap-2">
          {governorates
            .filter((g) => g.id !== form.locationId)
            .map((g) => (
              <button type="button" key={g.id} onClick={() => toggle("serviceAreaIds", g.id)} className={ui.pill(form.serviceAreaIds.includes(g.id))}>
                {governorateName(g, locale)}
              </button>
            ))}
        </div>

        <label className={ui.label}>{t("availableDays")}</label>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((day) => (
            <button type="button" key={day} onClick={() => toggle("availabilityDays", day)} className={ui.pill(form.availabilityDays.includes(day))}>
              {tDays(day)}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.takesUrgentJobs} onChange={(e) => update("takesUrgentJobs", e.target.checked)} className="accent-primary" />
          {t("takesUrgentJobs")}
        </label>
      </div>

      <div className="flex flex-col gap-3">
        <SectionHeading>{t("section4Title")}</SectionHeading>
        <label className={ui.label}>{t("shortIntro")}</label>
        <textarea className={ui.input} rows={4} maxLength={500} placeholder={t("shortIntroPlaceholder")} value={form.shortIntro} onChange={(e) => update("shortIntro", e.target.value)} />
      </div>
    </EditShell>
  );
}
