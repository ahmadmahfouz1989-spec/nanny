"use client";

import { celebrate } from "@/lib/celebrate";
import { useOrderErrorText } from "@/components/orders/order-bits";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { ui } from "@/lib/ui";
import { request } from "@/lib/request";
import LocationPicker from "@/components/onboarding/location-picker";
import OrderPhotos, { type OrderPhoto } from "@/components/orders/order-photos";
import { TRADES, type Trade } from "@/lib/validation/maintenance";

type Place = { governorateId: string | null; districtId: string | null; areaId: string | null; detail: string };

/** A repair job asking for quotes: trade, what's wrong, photos, where, when. */
export default function QuoteForm({ needsName, initialTrade }: { needsName: boolean; initialTrade: Trade | null }) {
  const t = useTranslations("Orders");
  const errorText = useOrderErrorText();
  const tTrades = useTranslations("Trades");
  const router = useRouter();
  const [trade, setTrade] = useState<Trade | null>(initialTrade);
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<OrderPhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [place, setPlace] = useState<Place>({ governorateId: null, districtId: null, areaId: null, detail: "" });
  const [timing, setTiming] = useState<"asap" | "scheduled">("asap");
  const [scheduledAt, setScheduledAt] = useState("");
  const [budget, setBudget] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    // The button always works and says what's missing, rather than
    // sitting greyed out with no reason.
    if (!trade) {
      setError(t("chooseTrade"));
      return;
    }
    if (description.trim().length < 3) {
      setError(t("describeNeed"));
      return;
    }
    if (needsName && fullName.trim().length < 2) {
      setError(t("enterYourName"));
      return;
    }
    if (!place.districtId) {
      setError(t("chooseDistrict"));
      return;
    }
    setSending(true);
    const res = await request("/api/errand-orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: "maintenance",
        service: trade,
        description: description.trim(),
        pickupDistrictId: place.districtId,
        pickupAreaId: place.areaId,
        pickupDetail: place.detail.trim() || undefined,
        timing,
        scheduledAt: timing === "scheduled" && scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
        budgetUsd: budget ? Number(budget) : undefined,
        photoPaths: photos.map((p) => p.path),
        fullName: needsName ? fullName.trim() : undefined,
      }),
    });
    const body = await res?.json().catch(() => null);
    setSending(false);
    if (!res?.ok || !body?.order) {
      setError(errorText(body));
      return;
    }
    celebrate();
    router.push(`/orders/${body.order.id}`);
  }

  return (
    <form onSubmit={submit} className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">{t("quotesTitle")}</h1>
        <p className="mt-1 text-sm text-muted">{t("quotesSubtitle")}</p>
      </div>

      <section className="flex flex-col gap-2">
        <span className={ui.label}>{t("trade")}</span>
        <div className="flex flex-wrap gap-2">
          {TRADES.map((s) => (
            <button key={s} type="button" aria-pressed={trade === s} className={ui.pill(trade === s)} onClick={() => setTrade(s)}>
              {tTrades(s)}
            </button>
          ))}
        </div>
      </section>

      <label className="flex flex-col gap-2">
        <span className={ui.label}>{t("jobWhat")}</span>
        <textarea
          dir="auto"
          required
          minLength={3}
          maxLength={1000}
          rows={3}
          className={ui.input}
          placeholder={t("jobWhatPlaceholder")}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>

      <OrderPhotos photos={photos} onChange={setPhotos} label={t("photos")} hint={t("photosHint")} onError={setError} onUploading={setUploading} />

      <section className="flex flex-col gap-2">
        <span className={ui.label}>{t("jobPlace")}</span>
        <LocationPicker
          governorateId={place.governorateId}
          districtId={place.districtId}
          areaId={place.areaId}
          detail={place.detail}
          onGovernorate={(id) => setPlace((p) => ({ ...p, governorateId: id, districtId: null, areaId: null }))}
          onArea={(districtId, areaId) => setPlace((p) => ({ ...p, districtId, areaId }))}
          onDetail={(detail) => setPlace((p) => ({ ...p, detail }))}
        />
        <p className="text-xs text-muted">{t("jobPlaceHint")}</p>
      </section>

      <section className="flex flex-col gap-2">
        <span className={ui.label}>{t("jobWhen")}</span>
        <div className="flex gap-2">
          <button type="button" aria-pressed={timing === "asap"} className={ui.pill(timing === "asap")} onClick={() => setTiming("asap")}>
            {t("asap")}
          </button>
          <button type="button" aria-pressed={timing === "scheduled"} className={ui.pill(timing === "scheduled")} onClick={() => setTiming("scheduled")}>
            {t("jobOnDate")}
          </button>
        </div>
        {timing === "scheduled" && (
          <input type="datetime-local" required className={ui.input} value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
        )}
      </section>

      <label className="flex flex-col gap-2">
        <span className={ui.label}>{t("budget")}</span>
        <input type="number" min={0} max={10000} step="1" inputMode="decimal" className={ui.input} value={budget} onChange={(e) => setBudget(e.target.value)} />
      </label>

      {needsName && (
        <label className="flex flex-col gap-2">
          <span className={ui.label}>{t("yourName")}</span>
          <input className={ui.input} maxLength={80} value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </label>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}
      <button type="submit" disabled={sending || uploading} className={ui.buttonPrimary}>
        {sending ? t("placing") : t("sendForQuotes")}
      </button>
    </form>
  );
}
