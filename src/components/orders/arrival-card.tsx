"use client";

import { useFormatter, useTranslations } from "next-intl";
import { ui } from "@/lib/ui";
import type { OrderView } from "@/lib/errand-order-view";

/**
 * "Arrives in about 12 min · around 3:45 PM" for the customer during a
 * delivery, with where the rider is in it (heading to the pickup, has it).
 * The minutes come with each poll of the order, so it keeps itself current.
 */
export default function ArrivalCard({ order }: { order: OrderView }) {
  const t = useTranslations("Orders");
  const format = useFormatter();
  const eta = order.eta;
  if (!eta || !order.provider) return null;
  const name = order.provider.name.split(" ")[0] || order.provider.name;
  const clock = (minutes: number) => format.dateTime(new Date(Date.parse(order.serverNow) + minutes * 60_000), { hour: "numeric", minute: "2-digit" });
  const ride = order.service === "moto_taxi";
  const { pickupMinutes: toPickup, dropoffMinutes: toDropoff } = eta;

  let headline: string | null = null;
  let detail: string | null = null;
  if (ride && toPickup !== null) {
    // A ride: the pickup is the passenger, so that's the wait that matters.
    headline = toPickup === 0 ? t("etaHere", { name }) : t("etaReachesYou", { name, minutes: toPickup });
    if (toDropoff !== null) detail = t("etaDestinationAround", { time: clock(toDropoff) });
  } else if (toDropoff !== null) {
    headline = toDropoff === 0 ? t("etaArrivingNow") : t("etaArrivesIn", { minutes: toDropoff });
    detail =
      toPickup === null
        ? t("etaHasIt", { name })
        : toPickup === 0
          ? t("trackingAtPickup", { name })
          : t("etaToPickup", { name, minutes: toPickup });
  } else if (toPickup !== null) {
    // No drop-off (an errand at one place): when they get there.
    headline = toPickup === 0 ? t("etaThere", { name }) : t("etaGetsThere", { name, minutes: toPickup });
  }
  if (!headline) return null;
  const at = ride ? toPickup : (toDropoff ?? toPickup);

  return (
    <div className={ui.card + " flex flex-col gap-1 p-4"} aria-live="polite">
      <span className={ui.label}>{t("etaLabel")}</span>
      <p className="font-display text-xl font-bold text-ink">
        {headline}
        {at !== null && at > 0 && <span className="text-base font-medium text-muted"> · {t("etaAround", { time: clock(at) })}</span>}
      </p>
      {detail && <p className="text-sm text-ink/80">{detail}</p>}
      {eta.basis === "offer" && <p className="text-xs text-muted">{t("etaFromOffer", { name })}</p>}
    </div>
  );
}
