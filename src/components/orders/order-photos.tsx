"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ui } from "@/lib/ui";
import { request } from "@/lib/request";

export type OrderPhoto = { path: string; url: string | null };

export const MAX_ORDER_PHOTOS = 3;

/**
 * Photos on an order (a repair job, or what a rider picks up), uploaded as
 * they're chosen (/api/order-photos); the order sends their paths.
 */
export default function OrderPhotos({
  photos,
  onChange,
  label,
  hint,
  onError,
  onUploading,
}: {
  photos: OrderPhoto[];
  onChange: (photos: OrderPhoto[]) => void;
  label: string;
  hint: string;
  onError: (message: string | null) => void;
  /** While a photo is uploading (the form waits for it before sending). */
  onUploading?: (uploading: boolean) => void;
}) {
  const t = useTranslations("Orders");
  const [uploading, setUploading] = useState(false);

  async function add(file: File) {
    onError(null);
    setUploading(true);
    onUploading?.(true);
    const form = new FormData();
    form.append("file", file);
    const res = await request("/api/order-photos", { method: "POST", body: form });
    const body = await res?.json().catch(() => null);
    setUploading(false);
    onUploading?.(false);
    if (!res?.ok || typeof body?.path !== "string") {
      onError(t("photoError"));
      return;
    }
    onChange([...photos, { path: body.path, url: body.url ?? null }].slice(0, MAX_ORDER_PHOTOS));
  }

  return (
    <section className="flex flex-col gap-2">
      <span className={ui.label}>{label}</span>
      <p className="-mt-1 text-xs text-muted">{hint}</p>
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
              onClick={() => onChange(photos.filter((x) => x.path !== p.path))}
            >
              ×
            </button>
          </div>
        ))}
        {photos.length < MAX_ORDER_PHOTOS && (
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
                if (file) void add(file);
              }}
            />
          </label>
        )}
      </div>
    </section>
  );
}
