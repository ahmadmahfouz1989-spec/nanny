"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { ui } from "@/lib/ui";
import { request } from "@/lib/request";
import LocationPicker from "@/components/onboarding/location-picker";
import { ERRAND_SERVICES, type ErrandService } from "@/lib/validation/errands";
import { NEEDS_DROPOFF } from "@/lib/validation/errand-order";

type Place = { governorateId: string | null; districtId: string | null; areaId: string | null; detail: string };
const emptyPlace: Place = { governorateId: null, districtId: null, areaId: null, detail: "" };

/** A new Delivery & Errands order: service, what's needed, where, when. */
export default function NewOrderForm() {
  const t = useTranslations("Orders");
  const ts = useTranslations("ErrandServices");
  const router = useRouter();
  const [service, setService] = useState<ErrandService>("delivery");
  const [description, setDescription] = useState("");
  const [pickup, setPickup] = useState<Place>(emptyPlace);
  const [dropoff, setDropoff] = useState<Place>(emptyPlace);
  const [timing, setTiming] = useState<"asap" | "scheduled">("asap");
  const [scheduledAt, setScheduledAt] = useState("");
  const [budget, setBudget] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const needsDropoff = (NEEDS_DROPOFF as readonly string[]).includes(service);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!pickup.districtId || (needsDropoff && !dropoff.districtId)) {
      setError(t("chooseDistrict"));
      return;
    }
    setSending(true);
    const res = await request("/api/errand-orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service,
        description: description.trim(),
        pickupDistrictId: pickup.districtId,
        pickupAreaId: pickup.areaId,
        pickupDetail: pickup.detail.trim() || undefined,
        dropoffDistrictId: needsDropoff ? dropoff.districtId : null,
        dropoffAreaId: needsDropoff ? dropoff.areaId : null,
        dropoffDetail: needsDropoff ? dropoff.detail.trim() || undefined : undefined,
        timing,
        scheduledAt: timing === "scheduled" && scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
        budgetUsd: budget ? Number(budget) : undefined,
      }),
    });
    const body = await res?.json().catch(() => null);
    setSending(false);
    if (!res?.ok || !body?.order) {
      setError(typeof body?.error === "string" ? body.error : t("error"));
      return;
    }
    router.push(`/orders/${body.order.id}`);
  }

  const placeFields = (place: Place, set: (p: Place) => void) => (
    <LocationPicker
      governorateId={place.governorateId}
      districtId={place.districtId}
      areaId={place.areaId}
      detail={place.detail}
      onGovernorate={(id) => set({ ...place, governorateId: id, districtId: null, areaId: null })}
      onArea={(districtId, areaId) => set({ ...place, districtId, areaId })}
      onDetail={(detail) => set({ ...place, detail })}
    />
  );

  return (
    <form onSubmit={submit} className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6">
      <div>
        <Link href="/orders" className="text-sm text-muted hover:text-ink">
          ← {t("back")}
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-ink">{t("newOrder")}</h1>
      </div>

      <section className="flex flex-col gap-2">
        <span className={ui.label}>{t("service")}</span>
        <div className="flex flex-wrap gap-2">
          {ERRAND_SERVICES.map((s) => (
            <button key={s} type="button" className={ui.pill(service === s)} onClick={() => setService(s)}>
              {ts(s)}
            </button>
          ))}
        </div>
      </section>

      <label className="flex flex-col gap-2">
        <span className={ui.label}>{t("whatNeeded")}</span>
        <textarea
          dir="auto"
          required
          minLength={3}
          maxLength={1000}
          rows={3}
          className={ui.input}
          placeholder={t("whatNeededPlaceholder")}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>

      <section className="flex flex-col gap-2">
        <span className={ui.label}>{t("pickup")}</span>
        {placeFields(pickup, setPickup)}
      </section>

      {needsDropoff && (
        <section className="flex flex-col gap-2">
          <span className={ui.label}>{t("dropoff")}</span>
          {placeFields(dropoff, setDropoff)}
        </section>
      )}
      <p className="-mt-2 text-xs text-muted">{t("landmarkHint")}</p>

      <section className="flex flex-col gap-2">
        <span className={ui.label}>{t("when")}</span>
        <div className="flex gap-2">
          <button type="button" className={ui.pill(timing === "asap")} onClick={() => setTiming("asap")}>
            {t("asap")}
          </button>
          <button type="button" className={ui.pill(timing === "scheduled")} onClick={() => setTiming("scheduled")}>
            {t("scheduled")}
          </button>
        </div>
        {timing === "scheduled" && (
          <input type="datetime-local" required className={ui.input} value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
        )}
      </section>

      <label className="flex flex-col gap-2">
        <span className={ui.label}>{t("budget")}</span>
        <input type="number" min={0} max={10000} step="0.5" inputMode="decimal" className={ui.input} value={budget} onChange={(e) => setBudget(e.target.value)} />
      </label>

      {error && <p className="text-sm text-danger">{error}</p>}
      <button type="submit" disabled={sending || description.trim().length < 3} className={ui.buttonPrimary}>
        {sending ? t("placing") : t("placeOrder")}
      </button>
    </form>
  );
}
