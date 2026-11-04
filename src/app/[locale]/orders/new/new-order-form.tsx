"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { ui } from "@/lib/ui";
import { request } from "@/lib/request";
import LocationPicker from "@/components/onboarding/location-picker";
import MapPlacePicker from "@/components/orders/map-place-picker";
import { emptyMapPlace, mapsEnabled, type MapPlace } from "@/lib/google-maps";
import { ERRAND_SERVICES, type ErrandService } from "@/lib/validation/errands";
import { NEEDS_DROPOFF } from "@/lib/validation/errand-order";

type Place = { governorateId: string | null; districtId: string | null; areaId: string | null; detail: string };
const emptyPlace: Place = { governorateId: null, districtId: null, areaId: null, detail: "" };

/** Answers carried over from the Delivery & Errands request just filled in. */
export type OrderPrefill = {
  service: ErrandService;
  description: string;
  pickup: Place;
  dropoffDetail: string;
  timing: "asap" | "scheduled";
  scheduledAt: string;
  budget: string;
};

/** A new Delivery & Errands order: service, what's needed, where, when. */
export default function NewOrderForm({ prefill = null, needsName = false }: { prefill?: OrderPrefill | null; needsName?: boolean }) {
  const t = useTranslations("Orders");
  const ts = useTranslations("ErrandServices");
  const router = useRouter();
  const [service, setService] = useState<ErrandService>(prefill?.service ?? "delivery");
  const [description, setDescription] = useState(prefill?.description ?? "");
  const [pickup, setPickup] = useState<Place>(prefill?.pickup ?? emptyPlace);
  const [dropoff, setDropoff] = useState<Place>(prefill ? { ...emptyPlace, detail: prefill.dropoffDetail } : emptyPlace);
  const [timing, setTiming] = useState<"asap" | "scheduled">(prefill?.timing ?? "asap");
  const [scheduledAt, setScheduledAt] = useState(prefill?.scheduledAt ?? "");
  const [budget, setBudget] = useState(prefill?.budget ?? "");
  // A new customer: the order makes their request, so it needs their name.
  const [fullName, setFullName] = useState("");
  const [askName, setAskName] = useState(needsName);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const needsDropoff = (NEEDS_DROPOFF as readonly string[]).includes(service);
  // With a Google Maps key: exact places on a map (From and To, each
  // anywhere). Without one: the area search, as before.
  const useMap = mapsEnabled();
  const [pickupMap, setPickupMap] = useState<MapPlace>(emptyMapPlace);
  const [dropoffMap, setDropoffMap] = useState<MapPlace>(emptyMapPlace);
  const mapFields = (prefix: "pickup" | "dropoff", m: MapPlace) => ({
    [`${prefix}Point`]: m.point,
    [`${prefix}Address`]: m.address.trim() || undefined,
    [`${prefix}PlaceName`]: m.name.trim() || undefined,
    [`${prefix}Instructions`]: m.instructions.trim() || undefined,
    [`${prefix}ContactName`]: m.contactName.trim() || undefined,
    [`${prefix}ContactPhone`]: m.contactPhone.trim() || undefined,
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (useMap ? !pickupMap.point || (needsDropoff && !dropoffMap.point) : !pickup.districtId || (needsDropoff && !dropoff.districtId)) {
      setError(useMap ? t("choosePlaceOnMap") : t("chooseDistrict"));
      return;
    }
    const places = useMap
      ? { ...mapFields("pickup", pickupMap), ...(needsDropoff ? mapFields("dropoff", dropoffMap) : {}) }
      : {
          pickupDistrictId: pickup.districtId,
          pickupAreaId: pickup.areaId,
          pickupDetail: pickup.detail.trim() || undefined,
          dropoffDistrictId: needsDropoff ? dropoff.districtId : null,
          dropoffAreaId: needsDropoff ? dropoff.areaId : null,
          dropoffDetail: needsDropoff ? dropoff.detail.trim() || undefined : undefined,
        };
    setSending(true);
    const res = await request("/api/errand-orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service,
        description: description.trim(),
        ...places,
        timing,
        scheduledAt: timing === "scheduled" && scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
        budgetUsd: budget ? Number(budget) : undefined,
        fullName: askName ? fullName.trim() : undefined,
      }),
    });
    const body = await res?.json().catch(() => null);
    setSending(false);
    if (body?.code === "name_required") {
      setAskName(true);
      setError(t("enterYourName"));
      return;
    }
    if (!res?.ok || !body?.order) {
      setError(typeof body?.error === "string" ? body.error : t("error"));
      return;
    }
    router.push(`/orders/${body.order.id}`);
  }

  // Functional updates: picking an area from the search sets the
  // governorate and then the district in the same click, and the second
  // mustn't overwrite the first.
  const placeFields = (place: Place, set: React.Dispatch<React.SetStateAction<Place>>) => (
    <LocationPicker
      governorateId={place.governorateId}
      districtId={place.districtId}
      areaId={place.areaId}
      detail={place.detail}
      onGovernorate={(id) => set((p) => ({ ...p, governorateId: id, districtId: null, areaId: null }))}
      onArea={(districtId, areaId) => set((p) => ({ ...p, districtId, areaId }))}
      onDetail={(detail) => set((p) => ({ ...p, detail }))}
    />
  );

  return (
    <form onSubmit={submit} className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6">
      <div>
        <Link href="/orders" className="text-sm text-muted hover:text-ink">
          ← {t("back")}
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-ink">{t("newOrder")}</h1>
        {prefill && <p className="mt-1 text-sm text-muted">{t("prefilledHint")}</p>}
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

      {useMap ? (
        <>
          <section className={ui.card + " flex flex-col gap-3 p-4"}>
            <h2 className="font-semibold text-ink">{needsDropoff ? t("mapFrom") : t("mapWhere")}</h2>
            <MapPlacePicker kind="pickup" value={pickupMap} onChange={setPickupMap} />
          </section>
          {needsDropoff && (
            <section className={ui.card + " flex flex-col gap-3 p-4"}>
              <h2 className="font-semibold text-ink">{t("mapTo")}</h2>
              <MapPlacePicker kind="dropoff" value={dropoffMap} onChange={setDropoffMap} />
            </section>
          )}
          <p className="-mt-2 text-xs text-muted">{t("mapPrivacyHint")}</p>
        </>
      ) : (
        <>
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
        </>
      )}

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

      {askName && (
        <label className="flex flex-col gap-2">
          <span className={ui.label}>{t("yourName")}</span>
          <input className={ui.input} maxLength={80} autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </label>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}
      <button type="submit" disabled={sending || description.trim().length < 3 || (askName && fullName.trim().length < 2)} className={ui.buttonPrimary}>
        {sending ? t("placing") : t("placeOrder")}
      </button>
    </form>
  );
}
