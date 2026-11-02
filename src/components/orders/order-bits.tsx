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

export function OrderStatusBadge({ status }: { status: string }) {
  const t = useTranslations("Orders");
  return <span className={ui.badge(STATUS_TONE[status] ?? "secondary")}>{t(`status_${status}` as "status_open")}</span>;
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
