"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ui } from "@/lib/ui";
import { FieldError } from "@/components/onboarding/field-label";
import type { FieldErrors } from "@/lib/form-errors";

type Location = {
  id: string;
  name_en: string;
  name_ar: string;
  name_fr: string;
  level: string;
  parent_location_id: string | null;
};

function localizedName(location: Location, locale: string) {
  if (locale === "ar") return location.name_ar;
  if (locale === "fr") return location.name_fr;
  return location.name_en;
}

/**
 * Pick a governorate from the list, then type the specific location
 * (street / building / neighbourhood) as free text. Only the governorate
 * feeds the match score. Each box shows its own error right under it, so a
 * missing governorate isn't reported under a filled-in neighbourhood.
 */
export default function LocationPicker({
  governorateId,
  detail,
  onGovernorate,
  onDetail,
  errors = {},
  showDetail = true,
}: {
  governorateId: string | null;
  detail: string;
  /** Off where the form already asks for the exact area another way. */
  showDetail?: boolean;
  onGovernorate: (id: string | null) => void;
  onDetail: (value: string) => void;
  errors?: FieldErrors;
}) {
  const locale = useLocale();
  const t = useTranslations("Location");
  const [governorates, setGovernorates] = useState<Location[]>([]);

  useEffect(() => {
    fetch("/api/locations?level=governorate")
      .then((res) => res.json())
      .then((body) => setGovernorates((body.locations ?? []) as Location[]))
      .catch(() => {});
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <select
        className={`${ui.select} ${errors.locationId ? "border-danger!" : ""}`}
        aria-invalid={!!errors.locationId}
        aria-label={t("governorate")}
        value={governorateId ?? ""}
        onChange={(e) => onGovernorate(e.target.value || null)}
      >
        <option value="">{t("governorate")}</option>
        {governorates.map((g) => (
          <option key={g.id} value={g.id}>
            {localizedName(g, locale)}
          </option>
        ))}
      </select>
      <FieldError field="locationId" errors={errors} />

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
