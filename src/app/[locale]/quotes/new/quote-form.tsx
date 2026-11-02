"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { ui } from "@/lib/ui";
import { request } from "@/lib/request";
import LocationPicker from "@/components/onboarding/location-picker";
import { TRADES, type Trade } from "@/lib/validation/maintenance";

type Place = { governorateId: string | null; districtId: string | null; areaId: string | null; detail: string };
type Photo = { path: string; url: string | null };

const MAX_PHOTOS = 3;

/** A repair job asking for quotes: trade, what's wrong, photos, where, when. */
export default function QuoteForm({ needsName, initialTrade }: { needsName: boolean; initialTrade: Trade | null }) {
  const t = useTranslations("Orders");
  const tTrades = useTranslations("Trades");
  const router = useRouter();
  const [trade, setTrade] = useState<Trade | null>(initialTrade);
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [uploading, setUploading] = useState(false);
  const [place, setPlace] = useState<Place>({ governorateId: null, districtId: null, areaId: null, detail: "" });
  const [timing, setTiming] = useState<"asap" | "scheduled">("asap");
  const [scheduledAt, setScheduledAt] = useState("");
  const [budget, setBudget] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function addPhoto(file: File) {
    setError(null);
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    const res = await request("/api/order-photos", { method: "POST", body: form });
    const body = await res?.json().catch(() => null);
    setUploading(false);
    if (!res?.ok || typeof body?.path !== "string") {
      setError(t("photoError"));
      return;
    }
    setPhotos((list) => [...list, { path: body.path, url: body.url ?? null }].slice(0, MAX_PHOTOS));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!trade) {
      setError(t("trade"));
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
      setError(typeof body?.error === "string" ? body.error : t("error"));
      return;
    }
    router.push(`/orders/${body.order.id}`);
  }

  const ready = !!trade && description.trim().length >= 3 && (!needsName || fullName.trim().length >= 2) && !uploading;

  return (
    <form onSubmit={submit} className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6">
      <div>
        <Link href="/categories/maintenance/dashboard" className="text-sm text-muted hover:text-ink">
          ← {t("back")}
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-ink">{t("quotesTitle")}</h1>
        <p className="mt-1 text-sm text-muted">{t("quotesSubtitle")}</p>
      </div>

      <section className="flex flex-col gap-2">
        <span className={ui.label}>{t("trade")}</span>
        <div className="flex flex-wrap gap-2">
          {TRADES.map((s) => (
            <button key={s} type="button" className={ui.pill(trade === s)} onClick={() => setTrade(s)}>
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

      <section className="flex flex-col gap-2">
        <span className={ui.label}>{t("photos")}</span>
        <p className="-mt-1 text-xs text-muted">{t("photosHint")}</p>
        <div className="flex flex-wrap gap-3">
          {photos.map((p) => (
            <div key={p.path} className="relative h-24 w-24 overflow-hidden rounded-xl border border-border bg-surface-sunken">
              {/* Short-lived private links: next/image can't optimise them. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {p.url && <img src={p.url} alt="" className="h-full w-full object-cover" />}
              <button
                type="button"
                aria-label={t("removePhoto")}
                className="absolute end-1 top-1 rounded-full bg-black/60 px-2 text-sm text-white"
                onClick={() => setPhotos((list) => list.filter((x) => x.path !== p.path))}
              >
                ×
              </button>
            </div>
          ))}
          {photos.length < MAX_PHOTOS && (
            <label className="flex h-24 w-24 cursor-pointer items-center justify-center rounded-xl border border-dashed border-border text-center text-xs text-muted hover:bg-surface-sunken">
              {uploading ? t("photoUploading") : `+ ${t("addPhoto")}`}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void addPhoto(file);
                }}
              />
            </label>
          )}
        </div>
      </section>

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
          <button type="button" className={ui.pill(timing === "asap")} onClick={() => setTiming("asap")}>
            {t("asap")}
          </button>
          <button type="button" className={ui.pill(timing === "scheduled")} onClick={() => setTiming("scheduled")}>
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
      <button type="submit" disabled={sending || !ready} className={ui.buttonPrimary}>
        {sending ? t("placing") : t("sendForQuotes")}
      </button>
    </form>
  );
}
