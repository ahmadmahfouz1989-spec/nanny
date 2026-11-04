"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ui } from "@/lib/ui";

// Small pieces shared by the order pages.

type Tone = "success" | "warning" | "danger" | "secondary" | "accent" | "berry";

const STATUS_TONE: Record<string, Tone> = {
  open: "accent",
  reserved: "warning",
  accepted: "secondary",
  on_the_way: "secondary",
  arrived: "secondary",
  picked_up: "secondary",
  delivered: "success",
  completed: "success",
  cancelled: "danger",
  no_provider: "danger",
};

// Stages that read differently for a repair job ("Waiting for quotes", "Job done").
const JOB_STATUS_LABELS = new Set(["open", "reserved", "accepted", "delivered", "no_provider"]);

/** The label of an order's stage, worded for its kind (delivery or repair job). */
export function useStatusLabel() {
  const t = useTranslations("Orders");
  return (status: string, category = "errands") =>
    category === "maintenance" && JOB_STATUS_LABELS.has(status) ? t(`jobStatus_${status}` as "jobStatus_open") : t(`status_${status}` as "status_open");
}

/**
 * The stage as a coloured pill, on one line. `choosing`: offers are in and
 * the customer is picking one -- says so instead of "Waiting for offers".
 */
export function OrderStatusBadge({ status, category = "errands", choosing = false }: { status: string; category?: string; choosing?: boolean }) {
  const label = useStatusLabel();
  const t = useTranslations("Orders");
  const picking = choosing && status === "open";
  return (
    <span className={ui.badge(picking ? "warning" : (STATUS_TONE[status] ?? "secondary")) + " shrink-0 whitespace-nowrap"}>
      {picking ? t("status_choosing") : label(status, category)}
    </span>
  );
}

/** "Same area" for a provider in the very area (0 km between area centres), else "2.4 km away". */
export function useDistanceLabel() {
  const t = useTranslations("Orders");
  return (km: number) => (km < 0.5 ? t("sameArea") : t("kmAway", { km }));
}

/**
 * Seconds left until `deadline`, counted from the server's clock
 * (`serverNow` from the last load) so a phone with the wrong time still
 * shows the right countdown. Re-renders every second; null without a
 * deadline. Each reload starts again from the server's figure.
 */
export function useSecondsLeft(deadline: string | null | undefined, serverNow: string) {
  const key = `${deadline}|${serverNow}`;
  const atLoad = deadline ? Math.max(0, Math.round((Date.parse(deadline) - Date.parse(serverNow)) / 1000)) : null;
  const [elapsed, setElapsed] = useState({ key: "", seconds: 0 });
  useEffect(() => {
    if (!deadline) return;
    const startedAt = Date.now();
    const timer = setInterval(() => setElapsed({ key, seconds: Math.floor((Date.now() - startedAt) / 1000) }), 1000);
    return () => clearInterval(timer);
  }, [deadline, key]);
  if (atLoad === null) return null;
  return Math.max(0, atLoad - (elapsed.key === key ? elapsed.seconds : 0));
}

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

/** "1:42", left-to-right even on Arabic pages. */
export function Countdown({ seconds }: { seconds: number }) {
  return (
    <bdi dir="ltr" className="font-semibold tabular-nums">
      {clock(seconds)}
    </bdi>
  );
}

/** "Delivery", "Paperwork"… or, for a repair job, the trade ("Plumber"). */
export function useServiceLabel() {
  const errands = useTranslations("ErrandServices");
  const trades = useTranslations("Trades");
  return (service: string, category = "errands") => (category === "maintenance" ? trades(service as "plumber") : errands(service as "delivery"));
}

/** "Order #12" or "Job #12". */
export function useOrderTitle() {
  const t = useTranslations("Orders");
  return (number: number, category = "errands") => (category === "maintenance" ? t("jobNumber", { number }) : t("orderNumber", { number }));
}

/** Available (green), busy (orange), offline (grey), suspended (red). */
export const AVAILABILITY_DOT: Record<string, string> = {
  available: "bg-success",
  busy: "bg-warning",
  offline: "bg-muted",
  suspended: "bg-danger",
};

export function placeLabel(p: { en: string; ar: string } | null | undefined, locale: string) {
  return p ? (locale === "ar" ? p.ar : p.en) : "";
}
