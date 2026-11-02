"use client";

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

export function OrderStatusBadge({ status, category = "errands" }: { status: string; category?: string }) {
  const label = useStatusLabel();
  return <span className={ui.badge(STATUS_TONE[status] ?? "secondary")}>{label(status, category)}</span>;
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
