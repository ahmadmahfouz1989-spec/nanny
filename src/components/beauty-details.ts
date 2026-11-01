"use client";

import { useFormatter, useTranslations } from "next-intl";
import { labelOr } from "@/lib/i18n-fallback";

/** The keys beautyRows reads -- the admin queue skips them in its generic list. */
export const BEAUTY_KEYS = [
  "beautyServices",
  "beautyService",
  "treatments",
  "providerType",
  "teamSize",
  "gender",
  "serves",
  "workplaces",
  "certified",
  "bringsKit",
  "chargesTravel",
  "pricing",
  "priceFromUsd",
  "priceNote",
  "hairLength",
  "massageMinutes",
  "removalAreas",
  "peopleCount",
  "forWhom",
  "providerGender",
  "place",
  "timing",
  "scheduledAt",
  "budgetUsd",
] as const;

type Format = ReturnType<typeof useFormatter>;
type T = ReturnType<typeof useTranslations>;

const usd = (format: Format, amount: number) => format.number(amount, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** "From $20 a session", "On quote" -- a beauty provider's price as one line, or null. */
export function beautyPrice(a: Record<string, unknown>, t: T, format: Format): string | null {
  if (typeof a.pricing !== "string") return null;
  if (a.pricing === "quote" || typeof a.priceFromUsd !== "number") return t(`price.${a.pricing}`);
  return t(`priceFrom.${a.pricing}`, { amount: usd(format, a.priceFromUsd) });
}

/**
 * A beauty profile or request's answers as label/value rows, for the
 * profile page, match details and the admin queue. A key that isn't on the
 * profile is left out, and yes/no answers only show when they're yes.
 */
export function useBeautyRows() {
  const t = useTranslations("BeautyFields");
  const tService = useTranslations("BeautyServices");
  const tTreatment = useTranslations("BeautyTreatments");
  const tOption = useTranslations("BeautyOptions");
  const tTiming = useTranslations("ErrandTiming");
  const format = useFormatter();

  return (a: Record<string, unknown>): { label: string; value: string }[] => {
    // Other categories share some keys (timing, pricing, providerType): only beauty gets these rows.
    if (a.beautyServices === undefined && a.beautyService === undefined) return [];
    const rows: { label: string; value: string }[] = [];
    const add = (key: string, value: string | null | undefined) => {
      if (value) rows.push({ label: t(key), value });
    };
    const option = (group: string, v: unknown) => (typeof v === "string" ? labelOr(tOption, `${group}.${v}`) : null);
    const options = (group: string, v: unknown) =>
      Array.isArray(v) ? (v as string[]).map((x) => labelOr(tOption, `${group}.${x}`)).join(", ") : null;

    const services = Array.isArray(a.beautyServices) ? (a.beautyServices as string[]) : [];
    add("beautyServices", services.map((s) => labelOr(tService, s)).join(", "));
    if (typeof a.beautyService === "string") add("beautyService", labelOr(tService, a.beautyService));
    if (Array.isArray(a.treatments)) add("treatments", (a.treatments as string[]).map((x) => labelOr(tTreatment, x)).join(", "));

    // Provider
    if (typeof a.providerType === "string") {
      const team = typeof a.teamSize === "number" && a.providerType !== "individual" ? ` · ${t("people", { count: a.teamSize })}` : "";
      add("providerType", labelOr(t, `providerTypes.${a.providerType}`) + team);
    }
    if (typeof a.gender === "string" && a.providerType !== "individual") add("team", option("teamGender", a.gender));
    add("serves", options("serves", a.serves));
    add("workplaces", options("workplacesShown", a.workplaces));
    const extras = [a.certified === true && t("certified"), a.bringsKit === true && t("bringsKit"), a.chargesTravel === true && t("chargesTravel")].filter(Boolean);
    add("good", extras.join(", "));
    add("pricing", beautyPrice(a, t, format));
    add("priceNote", typeof a.priceNote === "string" ? a.priceNote : null);

    // Request
    add("forWhom", option("forWhom", a.forWhom));
    if (typeof a.peopleCount === "number" && a.peopleCount > 1) add("peopleCount", t("people", { count: a.peopleCount }));
    if (a.providerGender === "female" || a.providerGender === "male") add("providerGender", option("genderPreference", a.providerGender));
    add("place", option("place", a.place));
    add("hairLength", option("hairLength", a.hairLength));
    if (typeof a.massageMinutes === "number") add("massageMinutes", t("minutes", { count: a.massageMinutes }));
    if (Array.isArray(a.removalAreas) && a.removalAreas.length) add("removalAreas", options("removalAreas", a.removalAreas));
    if (a.beautyService !== undefined) {
      if (a.timing === "asap") add("timing", tTiming("asap"));
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
