"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ui } from "@/lib/ui";
import { FieldError } from "@/components/onboarding/field-label";
import { SearchIcon } from "@/components/home-icons";
import type { FieldErrors } from "@/lib/form-errors";
import type { AreaHit } from "@/lib/areas";

type Governorate = { id: string; name_en: string; name_ar: string };

const nameOf = (x: { name_en: string; name_ar: string }, locale: string) => (locale === "ar" ? x.name_ar : x.name_en);

/**
 * Where someone is: type the area's name (Arabic or English -- "Hamra",
 * "صيدا") and pick it, or choose governorate, then district (qada), then
 * area. The district is what matching uses; the area is optional (the
 * official list doesn't have every everyday name), and a free-text
 * neighbourhood/street can go underneath. Each box shows its own error.
 */
export default function LocationPicker({
  governorateId,
  districtId = null,
  areaId = null,
  detail,
  onGovernorate,
  onArea,
  onDetail,
  errors = {},
  showDetail = true,
}: {
  governorateId: string | null;
  districtId?: string | null;
  areaId?: string | null;
  detail: string;
  onGovernorate: (id: string | null) => void;
  /** The district and (optional) area; picking them also sets the governorate. */
  onArea?: (districtId: string | null, areaId: string | null) => void;
  onDetail: (value: string) => void;
  errors?: FieldErrors;
  /** Off where the form already asks for the exact area another way. */
  showDetail?: boolean;
}) {
  const locale = useLocale();
  const t = useTranslations("Location");
  const [governorates, setGovernorates] = useState<Governorate[]>([]);
  const [districts, setDistricts] = useState<AreaHit[]>([]);
  const [areas, setAreas] = useState<AreaHit[]>([]);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<AreaHit[]>([]);
  const searchSeq = useRef(0);
  // A plain flag for the effects (onArea itself is a new function each render).
  const withAreas = !!onArea;

  useEffect(() => {
    fetch("/api/locations?level=governorate")
      .then((res) => res.json())
      .then((body) => setGovernorates((body.locations ?? []) as Governorate[]))
      .catch(() => {});
  }, []);

  // The lists below follow what's chosen above them.
  useEffect(() => {
    if (!governorateId || !withAreas) return;
    let active = true;
    fetch(`/api/areas?governorate=${governorateId}`)
      .then((r) => r.json())
      .then((b) => active && setDistricts(b.areas ?? []))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [governorateId, withAreas]);

  useEffect(() => {
    if (!districtId) return;
    let active = true;
    fetch(`/api/areas?district=${districtId}`)
      .then((r) => r.json())
      .then((b) => active && setAreas(b.areas ?? []))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [districtId]);

  function search(value: string) {
    setQuery(value);
    const seq = ++searchSeq.current;
    if (value.trim().length < 2) {
      setHits([]);
      return;
    }
    fetch(`/api/areas?q=${encodeURIComponent(value)}`)
      .then((r) => r.json())
      .then((b) => seq === searchSeq.current && setHits(b.areas ?? []))
      .catch(() => {});
  }

  function pick(hit: AreaHit) {
    onGovernorate(hit.governorateId);
    onArea?.(hit.districtId, hit.level === "area" ? hit.id : null);
    setQuery("");
    setHits([]);
  }

  return (
    <div className="flex flex-col gap-2">
      {onArea && (
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="search"
            dir="auto"
            value={query}
            onChange={(e) => search(e.target.value)}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchPlaceholder")}
            className={ui.input + " ps-9!"}
          />
          {hits.length > 0 && (
            <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-xl border border-border bg-surface shadow-lg">
              {hits.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => pick(h)}
                  className="flex w-full items-baseline justify-between gap-3 px-4 py-2.5 text-start text-sm hover:bg-surface-sunken"
                >
                  <span className="font-medium text-ink">{nameOf(h, locale)}</span>
                  <span className="shrink-0 text-xs text-muted">
                    {h.level === "district" ? t("districtOf", { place: h.parent ? nameOf(h.parent, locale) : "" }) : h.parent ? nameOf(h.parent, locale) : ""}
                  </span>
                </button>
              ))}
            </div>
          )}
          {query.trim().length >= 2 && hits.length === 0 && <p className="mt-1 text-xs text-muted">{t("noMatch")}</p>}
        </div>
      )}

      {onArea && <span className="-mb-1 text-xs font-medium text-muted">{t("governorate")}</span>}
      <select
        className={`${ui.select} ${errors.locationId ? "border-danger!" : ""}`}
        aria-invalid={!!errors.locationId}
        aria-label={t("governorate")}
        value={governorateId ?? ""}
        onChange={(e) => {
          onGovernorate(e.target.value || null);
          onArea?.(null, null);
        }}
      >
        <option value="">{t("governorate")}</option>
        {governorates.map((g) => (
          <option key={g.id} value={g.id}>
            {nameOf(g, locale)}
          </option>
        ))}
      </select>
      <FieldError field="locationId" errors={errors} />

      {onArea && governorateId && (
        <>
          <span className="-mb-1 text-xs font-medium text-muted">{t("district")}</span>
          <select
            className={`${ui.select} ${errors.districtId ? "border-danger!" : ""}`}
            aria-invalid={!!errors.districtId}
            aria-label={t("district")}
            value={districtId ?? ""}
            onChange={(e) => onArea(e.target.value || null, null)}
          >
            <option value="">{t("district")}</option>
            {districts.map((d) => (
              <option key={d.id} value={d.id}>
                {nameOf(d, locale)}
              </option>
            ))}
          </select>
          <FieldError field="districtId" errors={errors} />
        </>
      )}

      {onArea && districtId && <span className="-mb-1 text-xs font-medium text-muted">{t("areaOptional")}</span>}
      {onArea && districtId && (
        <select className={ui.select} aria-label={t("area")} value={areaId ?? ""} onChange={(e) => onArea(districtId, e.target.value || null)}>
          <option value="">{t("areaOptional")}</option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {nameOf(a, locale)}
            </option>
          ))}
        </select>
      )}

      {showDetail && (
        <input
          type="text"
          className={`${ui.input} ${errors.locationDetail ? "border-danger!" : ""}`}
          aria-invalid={!!errors.locationDetail}
          aria-label={t("detailPlaceholder")}
          placeholder={t("detailPlaceholder")}
          value={detail}
          onChange={(e) => onDetail(e.target.value)}
          maxLength={120}
        />
      )}
      {showDetail && <FieldError field="locationDetail" errors={errors} />}
    </div>
  );
}
