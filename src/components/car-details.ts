"use client";

import { useFormatter, useTranslations } from "next-intl";
import { labelOr } from "@/lib/i18n-fallback";

/** The keys carRows reads -- the admin queue skips them in its generic list. */
export const CAR_KEYS = [
  "carServices",
  "carService",
  "issues",
  "providerType",
  "workplaces",
  "makes",
  "fuels",
  "equipment",
  "warranty",
  "emergency24h",
  "pricing",
  "priceFromUsd",
  "priceNote",
  "carMake",
  "carModel",
  "carYear",
  "fuel",
  "drivable",
  "towTo",
  "place",
  "timing",
  "scheduledAt",
  "budgetUsd",
] as const;

type Format = ReturnType<typeof useFormatter>;
type T = ReturnType<typeof useTranslations>;

const usd = (format: Format, amount: number) => format.number(amount, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** "From $20 a job", "On quote" -- a car provider's price as one line, or null. */
export function carPrice(a: Record<string, unknown>, t: T, format: Format): string | null {
  if (typeof a.pricing !== "string") return null;
  if (a.pricing === "quote" || typeof a.priceFromUsd !== "number") return t(`price.${a.pricing}`);
  return t(`priceFrom.${a.pricing}`, { amount: usd(format, a.priceFromUsd) });
}

/**
 * A car services profile or request's answers as label/value rows, for
 * match details, the profile page and the admin queue. A key that isn't on
 * the profile is left out, and yes/no answers only show when they're yes.
 */
export function useCarRows() {
  const t = useTranslations("CarFields");
  const tService = useTranslations("CarServices");
  const tIssue = useTranslations("CarIssues");
  const tMake = useTranslations("CarMakes");
  const tOption = useTranslations("CarOptions");
  const format = useFormatter();

  return (a: Record<string, unknown>): { label: string; value: string }[] => {
    // Other categories share some keys (timing, place, pricing): only car services get these rows.
    if (a.carServices === undefined && a.carService === undefined) return [];
    const rows: { label: string; value: string }[] = [];
    const add = (key: string, value: string | null | undefined) => {
      if (value) rows.push({ label: t(key), value });
    };
    const option = (group: string, v: unknown) => (typeof v === "string" ? labelOr(tOption, `${group}.${v}`) : null);
    const options = (group: string, v: unknown) =>
      Array.isArray(v) && v.length ? (v as string[]).map((x) => labelOr(tOption, `${group}.${x}`)).join(", ") : null;

    const services = Array.isArray(a.carServices) ? (a.carServices as string[]) : [];
    add("carServices", services.map((s) => labelOr(tService, s)).join(", "));
    if (typeof a.carService === "string") add("carService", labelOr(tService, a.carService));
    if (Array.isArray(a.issues)) add("issues", (a.issues as string[]).map((x) => labelOr(tIssue, x)).join(", "));

    // Provider
    if (typeof a.providerType === "string") add("providerType", labelOr(t, `providerTypes.${a.providerType}`));
    add("workplaces", options("workplacesShown", a.workplaces));
    if (Array.isArray(a.makes)) add("makes", a.makes.length ? (a.makes as string[]).map((m) => labelOr(tMake, m)).join(", ") : t("allMakes"));
    add("fuels", options("fuel", a.fuels));
    add("equipment", options("equipment", a.equipment));
    const extras = [a.emergency24h === true && t("emergency24h"), a.warranty === true && t("warranty")].filter(Boolean);
    add("good", extras.join(", "));
    add("pricing", carPrice(a, t, format));
    add("priceNote", typeof a.priceNote === "string" ? a.priceNote : null);

    // Request
    if (typeof a.carMake === "string") {
      const car = [labelOr(tMake, a.carMake), typeof a.carModel === "string" ? a.carModel : null, typeof a.carYear === "number" ? String(a.carYear) : null];
      add("car", car.filter(Boolean).join(" "));
    }
    if (typeof a.fuel === "string" && a.fuel !== "petrol") add("fuel", option("fuel", a.fuel));
    if (a.drivable === false) add("drivable", t("notDrivable"));
    add("towTo", typeof a.towTo === "string" ? a.towTo : null);
    if (a.carService !== undefined) {
      add("place", option("place", a.place));
      if (a.timing === "emergency" || a.timing === "asap") add("timing", option("timing", a.timing));
      if (a.timing === "scheduled" && typeof a.scheduledAt === "string") {
        // Stored as the wall-clock time typed in ("2026-11-02T09:30"); read
        // and shown as UTC so server and browser print the same thing.
        const when = new Date(`${a.scheduledAt}Z`);
        add("timing", Number.isNaN(when.getTime()) ? a.scheduledAt : format.dateTime(when, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }));
      }
    }
    if (typeof a.budgetUsd === "number") add("budgetUsd", usd(format, a.budgetUsd));
    return rows;
  };
}
