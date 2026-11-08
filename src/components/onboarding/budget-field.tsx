"use client";

import { useTranslations } from "next-intl";
import FieldLabel from "@/components/onboarding/field-label";
import type { FieldErrors } from "@/lib/form-errors";
import type { RateUnit } from "@/lib/validation/rate";
import { ui } from "@/lib/ui";

export type BudgetState = { unit: RateUnit; maxUsd: string };

/** The form's budget as the `budget` attribute, or undefined when left empty. */
export function budgetPayload(b: BudgetState) {
  return b.maxUsd === "" ? undefined : { unit: b.unit, maxUsd: Number(b.maxUsd) };
}

export function budgetState(v: unknown, units: readonly RateUnit[]): BudgetState {
  const b = (v ?? {}) as { unit?: RateUnit; maxUsd?: number };
  return { unit: b.unit && units.includes(b.unit) ? b.unit : units[0], maxUsd: typeof b.maxUsd === "number" ? String(b.maxUsd) : "" };
}

/** A request's budget: an amount and what it's for ($600 a month, $10 an hour). Optional. */
export default function BudgetField({
  units,
  value,
  onChange,
  errors,
}: {
  units: readonly RateUnit[];
  value: BudgetState;
  onChange: (v: BudgetState) => void;
  errors: FieldErrors;
}) {
  const t = useTranslations("Rates");
  return (
    <>
      <FieldLabel field="budget" errors={errors} optional>{t("yourBudget")}</FieldLabel>
      <div className="flex flex-wrap gap-2">
        {units.map((u) => (
          <button type="button" key={u} onClick={() => onChange({ ...value, unit: u })} aria-pressed={value.unit === u} className={ui.pill(value.unit === u)}>
            {t(`unit.${u}`)}
          </button>
        ))}
      </div>
      <input type="number" inputMode="decimal" min={1} className={ui.input} placeholder={t("budgetPlaceholder")} value={value.maxUsd} onChange={(e) => onChange({ ...value, maxUsd: e.target.value })} />
    </>
  );
}
