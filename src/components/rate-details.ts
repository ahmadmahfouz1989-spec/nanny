"use client";

import { useFormatter, useTranslations } from "next-intl";

type Format = ReturnType<typeof useFormatter>;
type T = ReturnType<typeof useTranslations>;

const usd = (format: Format, amount: number) => format.number(amount, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** "From $5 an hour", "Per month", "To discuss" -- a `rate` attribute as one line, or null. */
export function ratePrice(rate: unknown, t: T, format: Format): string | null {
  const r = rate as { unit?: string; fromUsd?: number } | undefined;
  if (!r || typeof r.unit !== "string") return null;
  if (r.unit === "quote" || typeof r.fromUsd !== "number") return t(`unit.${r.unit}`);
  return t(`from.${r.unit}`, { amount: usd(format, r.fromUsd) });
}

/** The `rate` and `budget` attributes as label/value rows, for match details and the admin queue. */
export function useRateRows() {
  const t = useTranslations("Rates");
  const format = useFormatter();
  return (a: Record<string, unknown>): { label: string; value: string }[] => {
    const rows: { label: string; value: string }[] = [];
    const price = ratePrice(a.rate, t, format);
    if (price) rows.push({ label: t("price"), value: price });
    const note = (a.rate as { note?: string } | undefined)?.note;
    if (note) rows.push({ label: t("prices"), value: note });
    const budget = a.budget as { unit?: string; maxUsd?: number } | undefined;
    if (budget && typeof budget.maxUsd === "number" && typeof budget.unit === "string") {
      rows.push({ label: t("budget"), value: t(`upTo.${budget.unit}`, { amount: usd(format, budget.maxUsd) }) });
    }
    return rows;
  };
}

/** A nurse's gender and a request's woman-or-man preference, as rows. Beauty shows its own. */
export function useGenderRows() {
  const t = useTranslations("Rates");
  return (a: Record<string, unknown>): { label: string; value: string }[] => {
    if (a.beautyServices !== undefined || a.beautyService !== undefined) return [];
    const rows: { label: string; value: string }[] = [];
    if (a.gender === "female" || a.gender === "male") rows.push({ label: t("gender"), value: t(`genders.${a.gender}`) });
    if (a.providerGender === "female" || a.providerGender === "male") rows.push({ label: t("prefers"), value: t(`genders.${a.providerGender}`) });
    return rows;
  };
}
