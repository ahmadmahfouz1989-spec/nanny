"use client";

import { useFormatter, useTranslations } from "next-intl";
import { labelOr } from "@/lib/i18n-fallback";

/** The keys cleaningRows reads -- the admin queue skips them in its generic list. */
export const CLEANING_KEYS = [
  "cleaningServices",
  "cleaningService",
  "providerType",
  "teamSize",
  "equipment",
  "bringsSupplies",
  "ecoProducts",
  "transport",
  "pricing",
  "priceFromUsd",
  "minHours",
  "priceNote",
  "placeType",
  "size",
  "bathrooms",
  "furnished",
  "dirtLevel",
  "extras",
  "windowsCount",
  "highWindows",
  "sofaSeats",
  "carpets",
  "mattresses",
  "tankCount",
  "frequency",
  "hoursPerVisit",
  "timing",
  "scheduledAt",
  "needsSupplies",
  "hasPets",
  "canPickUp",
  "budgetUsd",
] as const;

type Format = ReturnType<typeof useFormatter>;
type T = ReturnType<typeof useTranslations>;

const usd = (format: Format, amount: number) => format.number(amount, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** "From $6 an hour", "On quote" -- a cleaner's price as one line, or null. */
export function cleaningPrice(a: Record<string, unknown>, t: T, format: Format): string | null {
  if (typeof a.pricing !== "string") return null;
  if (a.pricing === "quote" || typeof a.priceFromUsd !== "number") return t(`price.${a.pricing}`);
  return t(`priceFrom.${a.pricing}`, { amount: usd(format, a.priceFromUsd) });
}

/**
 * A cleaning profile or request's answers as label/value rows, for match
 * cards, the profile page and the admin queue. A key that isn't on the
 * profile is left out, and yes/no answers only show when they're yes.
 */
export function useCleaningRows() {
  const t = useTranslations("CleaningFields");
  const tService = useTranslations("CleaningServices");
  const tOption = useTranslations("CleaningOptions");
  const tTiming = useTranslations("ErrandTiming");
  const format = useFormatter();

  return (a: Record<string, unknown>): { label: string; value: string }[] => {
    // Errands share some keys (timing, budgetUsd, pricing): only cleaning gets these rows.
    if (a.cleaningServices === undefined && a.cleaningService === undefined) return [];
    const rows: { label: string; value: string }[] = [];
    const add = (key: string, value: string | null | undefined) => {
      if (value) rows.push({ label: t(key), value });
    };
    const option = (group: string, v: unknown) => (typeof v === "string" ? labelOr(tOption, `${group}.${v}`) : null);
    const options = (group: string, v: unknown) =>
      Array.isArray(v) ? (v as string[]).map((x) => labelOr(tOption, `${group}.${x}`)).join(", ") : null;
    const number = (v: unknown) => (typeof v === "number" && v > 0 ? String(v) : null);

    const services = Array.isArray(a.cleaningServices) ? (a.cleaningServices as string[]) : [];
    add("cleaningServices", services.map((s) => labelOr(tService, s)).join(", "));
    if (typeof a.cleaningService === "string") add("cleaningService", labelOr(tService, a.cleaningService));

    // Provider
    if (typeof a.providerType === "string") {
      const team = typeof a.teamSize === "number" && a.providerType !== "individual" ? ` · ${t("people", { count: a.teamSize })}` : "";
      add("providerType", labelOr(t, `providerTypes.${a.providerType}`) + team);
    }
    add("pricing", cleaningPrice(a, t, format));
    if (a.pricing === "per_hour") add("minHours", typeof a.minHours === "number" ? t("hours", { count: a.minHours }) : null);
    add("priceNote", typeof a.priceNote === "string" ? a.priceNote : null);
    const brings = [a.bringsSupplies === true && t("bringsSupplies"), a.ecoProducts === true && t("ecoProducts")].filter(Boolean).join(", ");
    add("supplies", brings);
    add("equipment", options("equipment", a.equipment));
    add("transport", option("transport", a.transport));

    // Request
    add("placeType", option("placeType", a.placeType));
    add("size", option("size", a.size));
    add("bathrooms", number(a.bathrooms));
    if (a.furnished !== undefined) add("furnished", a.furnished ? t("furnishedYes") : t("furnishedNo"));
    add("dirtLevel", option("dirtLevel", a.dirtLevel));
    add("extras", options("extras", a.extras));
    add("windowsCount", number(a.windowsCount));
    if (a.highWindows === true) add("highWindows", t("yes"));
    const items = [
      number(a.sofaSeats) && t("sofaSeats", { count: a.sofaSeats as number }),
      number(a.carpets) && t("carpets", { count: a.carpets as number }),
      number(a.mattresses) && t("mattresses", { count: a.mattresses as number }),
    ].filter(Boolean);
    add("items", items.join(", "));
    add("tankCount", number(a.tankCount));
    add("frequency", option("frequency", a.frequency));
    add("hoursPerVisit", typeof a.hoursPerVisit === "number" ? t("hours", { count: a.hoursPerVisit }) : null);
    if (a.frequency === "once" || a.frequency === undefined) {
      if (a.timing === "asap") add("timing", tTiming("asap"));
      if (a.timing === "scheduled" && typeof a.scheduledAt === "string") {
        // Stored as the wall-clock time typed in ("2026-11-02T09:30"); read
        // and shown as UTC so server and browser print the same thing.
        const when = new Date(`${a.scheduledAt}Z`);
        add("timing", Number.isNaN(when.getTime()) ? a.scheduledAt : format.dateTime(when, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }));
      }
    }
    const asks = [a.needsSupplies === true && t("needsSupplies"), a.hasPets === true && t("hasPets"), a.canPickUp === true && t("canPickUp")].filter(Boolean);
    add("good", asks.join(", "));
    if (typeof a.budgetUsd === "number") add("budgetUsd", usd(format, a.budgetUsd));
    return rows;
  };
}
