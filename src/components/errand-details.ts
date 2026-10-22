"use client";

import { useFormatter, useTranslations } from "next-intl";
import { labelOr } from "@/lib/i18n-fallback";

/** The keys errandRows reads -- the admin queue skips them in its generic list. */
export const ERRAND_KEYS = [
  "errandServices",
  "errandService",
  "vehicle",
  "pricing",
  "priceNote",
  "maxWaitHours",
  "paperworkTypes",
  "canDoMultipleStops",
  "canPayForPurchases",
  "hasDrivingLicense",
  "hasInsurance",
  "hasPassengerHelmet",
  "institution",
  "storeName",
  "budgetUsd",
  "pickupPlace",
  "dropoffPlace",
  "expectedWaitHours",
  "passengers",
  "timing",
  "scheduledAt",
  "deadline",
  "notes",
] as const;

/**
 * A Delivery & Errands profile's answers as label/value rows, for match
 * cards, the profile panel and the admin queue. A key that isn't on the
 * profile is left out, and the yes/no extras only show when they're yes
 * ("Has insurance: No" on every delivery rider would be noise).
 */
export function useErrandRows() {
  const t = useTranslations("ErrandFields");
  const tService = useTranslations("ErrandServices");
  const tVehicle = useTranslations("Vehicles");
  const tPricing = useTranslations("ErrandPricing");
  const tTiming = useTranslations("ErrandTiming");
  const format = useFormatter();

  return (a: Record<string, unknown>): { label: string; value: string }[] => {
    const rows: { label: string; value: string }[] = [];
    const add = (key: string, value: string | null | undefined) => {
      if (value) rows.push({ label: t(key), value });
    };
    const text = (v: unknown) => (typeof v === "string" ? v : null);
    const hours = (v: unknown) => (typeof v === "number" ? t("hours", { count: v }) : null);

    const services = Array.isArray(a.errandServices) ? (a.errandServices as string[]) : [];
    add("errandServices", services.map((s) => labelOr(tService, s)).join(", "));
    if (typeof a.errandService === "string") add("errandService", labelOr(tService, a.errandService));
    if (typeof a.vehicle === "string") add("vehicle", labelOr(tVehicle, a.vehicle));
    if (typeof a.pricing === "string") {
      const note = text(a.priceNote);
      add("pricing", labelOr(tPricing, a.pricing) + (note ? ` · ${note}` : ""));
    }
    add("maxWaitHours", hours(a.maxWaitHours));
    add("paperworkTypes", text(a.paperworkTypes));
    const extras = (["canDoMultipleStops", "canPayForPurchases", "hasDrivingLicense", "hasInsurance", "hasPassengerHelmet"] as const).filter(
      (k) => a[k] === true,
    );
    add("extras", extras.map((k) => t(k)).join(", "));

    add("institution", text(a.institution));
    add("storeName", text(a.storeName));
    if (typeof a.budgetUsd === "number") add("budgetUsd", format.number(a.budgetUsd, { style: "currency", currency: "USD", maximumFractionDigits: 0 }));
    add(a.errandService === "queue" ? "queuePlace" : "pickupPlace", text(a.pickupPlace));
    add(a.errandService === "moto_taxi" ? "destination" : "dropoffPlace", text(a.dropoffPlace));
    add("expectedWaitHours", hours(a.expectedWaitHours));
    if (typeof a.passengers === "number") add("passengers", String(a.passengers));
    if (a.timing === "asap") add("timing", tTiming("asap"));
    if (a.timing === "scheduled" && typeof a.scheduledAt === "string") {
      // Stored as the wall-clock time typed in ("2026-10-24T09:30"); read
      // and shown as UTC so server and browser print the same thing.
      const when = new Date(`${a.scheduledAt}Z`);
      add("timing", Number.isNaN(when.getTime()) ? a.scheduledAt : format.dateTime(when, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }));
    }
    if (typeof a.deadline === "string") {
      const due = new Date(a.deadline);
      add("deadline", Number.isNaN(due.getTime()) ? a.deadline : format.dateTime(due, { dateStyle: "medium", timeZone: "UTC" }));
    }
    add("notes", text(a.notes));
    return rows;
  };
}
