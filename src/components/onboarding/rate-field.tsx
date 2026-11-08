"use client";

import { useTranslations } from "next-intl";
import FieldLabel from "@/components/onboarding/field-label";
import type { FieldErrors } from "@/lib/form-errors";
import type { RateUnit } from "@/lib/validation/rate";
import { ui } from "@/lib/ui";

export type RateState = { unit: RateUnit | "quote" | ""; fromUsd: string; note: string };
export const EMPTY_RATE: RateState = { unit: "", fromUsd: "", note: "" };

/** The form's rate as the `rate` attribute, or undefined when no way of charging is picked. */
export function ratePayload(r: RateState) {
  if (!r.unit) return undefined;
  return {
    unit: r.unit,
    fromUsd: r.unit !== "quote" && r.fromUsd !== "" ? Number(r.fromUsd) : undefined,
    note: r.note.trim() || undefined,
  };
}

export function rateState(v: unknown): RateState {
  const r = (v ?? {}) as { unit?: RateUnit | "quote"; fromUsd?: number; note?: string };
  return { unit: r.unit ?? "", fromUsd: typeof r.fromUsd === "number" ? String(r.fromUsd) : "", note: r.note ?? "" };
}

/**
 * How a provider charges and from how much -- optional, but it's the first
 * thing people ask, and it shows on their match card ("From $5 an hour").
 */
export default function RateField({
  units,
  value,
  onChange,
  errors,
  notePlaceholder,
}: {
  units: readonly RateUnit[];
  value: RateState;
  onChange: (v: RateState) => void;
  errors: FieldErrors;
  notePlaceholder?: string;
}) {
  const t = useTranslations("Rates");
  return (
    <>
      <FieldLabel field="rate" errors={errors} optional>{t("howYouCharge")}</FieldLabel>
      <div className="flex flex-wrap gap-2">
        {[...units, "quote" as const].map((u) => (
          <button type="button" key={u} onClick={() => onChange({ ...value, unit: value.unit === u ? "" : u })} aria-pressed={value.unit === u} className={ui.pill(value.unit === u)}>
            {t(`unit.${u}`)}
          </button>
        ))}
      </div>
      {value.unit && value.unit !== "quote" && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">{t(`fromQuestion.${value.unit}`)}</span>
          <input type="number" inputMode="decimal" min={1} className={ui.input} value={value.fromUsd} onChange={(e) => onChange({ ...value, fromUsd: e.target.value })} />
        </label>
      )}
      {value.unit && (
        <input className={ui.input} maxLength={160} placeholder={notePlaceholder ?? t("notePlaceholder")} value={value.note} onChange={(e) => onChange({ ...value, note: e.target.value })} />
      )}
    </>
  );
}
