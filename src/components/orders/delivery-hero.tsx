"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ui } from "@/lib/ui";
import CallButton from "@/components/calls/call-button";
import RatingButton from "@/components/matches/rating-button";
import { Avatar } from "@/app/[locale]/feed/feed-shared";
import type { OrderView } from "@/lib/errand-order-view";
import { NEEDS_DROPOFF } from "@/lib/validation/errand-order";

/** The statuses the customer follows a delivery through, from accepted to done. */
const TRACKED = ["open", "reserved", "accepted", "on_the_way", "arrived", "picked_up", "delivered", "completed"];
/** A position older than this is shown greyed out, with when it was. */
const STALE_MS = 2 * 60_000;
/** The arrival moving later by more than this is said, not slipped in. */
const LATE_MS = 5 * 60_000;

export const showsDeliveryHero = (order: OrderView) => order.viewer === "seeker" && order.category === "errands" && TRACKED.includes(order.status);

/** Where the order is, as one of four steps (-1 = still finding a rider). */
function stepOf(status: string) {
  if (status === "accepted" || status === "on_the_way") return 0;
  if (status === "arrived") return 1;
  if (status === "picked_up") return 2;
  if (status === "delivered" || status === "completed") return 3;
  return -1;
}

/** "12–15 min": a little room, so a minute's slip doesn't look broken. */
const range = (minutes: number) => ({ min: minutes, max: minutes + Math.max(2, Math.round(minutes * 0.25)) });

/**
 * The top of a delivery for the customer: when it gets there (or what's
 * happening before a rider has it), the four steps, and the rider with
 * Call and Message. Done: when it arrived, the rating and Order again.
 */
export default function DeliveryHero({ order }: { order: OrderView }) {
  const t = useTranslations("Orders");
  const tv = useTranslations("Vehicles");
  const format = useFormatter();
  const now = Date.parse(order.serverNow);
  const clock = (ms: number) => format.dateTime(new Date(ms), { hour: "numeric", minute: "2-digit" });
  const ride = order.service === "moto_taxi";
  // Paperwork and queues have nothing to carry: there, started, done.
  const carries = (NEEDS_DROPOFF as readonly string[]).includes(order.service);
  const step = stepOf(order.status);
  const rider = order.provider;
  const name = rider ? rider.name.split(" ")[0] || rider.name : "";
  const eta = order.eta;
  const toPickup = eta?.pickupMinutes ?? null;
  const toDropoff = eta?.dropoffMinutes ?? null;

  // What the customer is waiting for: the rider (a ride, before pickup) or the order.
  const waitFor = ride && toPickup !== null ? toPickup : (toDropoff ?? toPickup);
  const arrival = waitFor !== null ? now + waitFor * 60_000 : null;
  // The earliest arrival given on this leg: a later one by much is said.
  const leg = `${order.status === "picked_up" ? "drop" : "pick"}:${order.id}`;
  const [first, setFirst] = useState<{ leg: string; at: number } | null>(null);
  if (arrival !== null && (!first || first.leg !== leg)) setFirst({ leg, at: arrival });
  else if (arrival !== null && first && arrival < first.at) setFirst({ leg, at: arrival });
  const late = arrival !== null && first?.leg === leg && arrival - first.at > LATE_MS;

  const seenAgo = order.riderAt ? now - Date.parse(order.riderAt.at) : null;
  const stale = seenAgo !== null && seenAgo > STALE_MS;
  const doneAt = order.timeline.find((s) => s.status === "delivered")?.at ?? null;

  let headline: string;
  let detail: string | null = null;
  if (order.status === "open") {
    const offers = order.offers.some((o) => o.status === "offered");
    headline = offers ? t("heroOffersIn") : t("heroFinding");
    if (order.autoAccept && order.budgetUsd !== null) detail = t("heroTakingFirst", { budget: order.budgetUsd });
  } else if (order.status === "reserved") {
    headline = t("heroConfirming", { name });
  } else if (order.status === "delivered" || order.status === "completed") {
    headline = !ride && !carries
      ? t("heroDone")
      : doneAt
        ? t(ride ? "heroArrivedAt" : "heroDeliveredAt", { time: clock(Date.parse(doneAt)) })
        : t(ride ? "heroArrived" : "heroDelivered");
  } else if (ride && toPickup !== null) {
    // A ride: the pickup is the passenger.
    headline = toPickup === 0 ? t("etaHere", { name }) : toPickup <= 2 ? t("heroAlmostThere") : t("heroReachesYou", { name, ...range(toPickup) });
    if (toDropoff !== null) detail = t("etaDestinationAround", { time: clock(now + toDropoff * 60_000) });
  } else if (toDropoff !== null) {
    headline = toDropoff === 0 ? t("etaArrivingNow") : toDropoff <= 2 ? t("heroAlmostThere") : t("heroArrivesIn", range(toDropoff));
    detail = toPickup === null ? t("etaHasIt", { name }) : toPickup === 0 ? t("trackingAtPickup", { name }) : t("etaToPickup", { name, minutes: toPickup });
  } else if (toPickup !== null) {
    headline = toPickup === 0 ? t("etaThere", { name }) : t("heroGetsThere", { name, ...range(toPickup) });
  } else {
    // No position and past the time they gave: what they're doing, no number.
    headline = order.status === "picked_up" ? (carries ? t("etaHasIt", { name }) : t("heroStarted", { name })) : order.status === "arrived" ? t("trackingAtPickup", { name }) : t("trackingLive", { name });
  }
  const showClock = arrival !== null && waitFor !== null && waitFor > 2 && step >= 0 && step < 3;

  // When each step was reached, shown under it once done.
  const reachedAt = (i: number) => {
    const status = ["accepted", "arrived", "picked_up", "delivered"][i];
    const at = [...order.timeline].reverse().find((e) => e.status === status)?.at;
    return at ? clock(Date.parse(at)) : null;
  };
  const steps = ride
    ? [t("stepAccepted"), t("stepRiderHere"), t("stepOnRide"), t("stepRideDone")]
    : carries
      ? [t("stepAccepted"), t("stepAtPickup"), t("stepPickedUp"), t("stepDelivered")]
      : [t("stepAccepted"), t("stepThere"), t("stepStarted"), t("stepDone")];

  return (
    <section className={ui.card + " flex flex-col gap-4 p-4"} aria-live="polite">
      <div className={`flex flex-col gap-1 transition-opacity ${stale && step < 3 ? "opacity-60" : ""}`}>
        <p className="flex items-center gap-2 font-display text-2xl font-bold leading-tight text-ink text-balance">
          {step < 0 && (
            <span aria-hidden className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60 motion-reduce:hidden" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
            </span>
          )}
          <span>{headline}</span>
        </p>
        {showClock && <p className="text-sm font-medium text-muted">{t("etaAround", { time: clock(arrival!) })}</p>}
        {detail && <p className="text-sm text-ink/80">{detail}</p>}
        {late && <p className="text-sm font-medium text-warning">{t("heroLate")}</p>}
        {stale && step < 3 && <p className="text-xs text-muted">{t("heroLastSeen", { minutes: Math.round(seenAgo! / 60_000) })}</p>}
        {!stale && eta?.basis === "offer" && step < 3 && <p className="text-xs text-muted">{t("etaFromOffer", { name })}</p>}
      </div>

      {/* The four steps, filling in as it goes. */}
      <ol className="grid grid-cols-4 gap-1.5" aria-label={t("progress")}>
        {steps.map((label, i) => {
          const done = i <= step;
          const current = i === step && step < 3;
          return (
            <li key={label} className="flex min-w-0 flex-col gap-1.5" aria-current={current ? "step" : undefined}>
              <span className="relative h-1.5 overflow-hidden rounded-full bg-border">
                <span
                  className={`absolute inset-y-0 start-0 rounded-full transition-all duration-700 ${done ? (current ? "bg-primary" : "bg-success") : ""} ${current ? "w-full animate-pulse motion-reduce:animate-none" : done ? "w-full" : "w-0"}`}
                />
              </span>
              <span className={`truncate text-xs ${done ? "font-semibold text-ink" : "text-muted"}`}>{label}</span>
              {done && reachedAt(i) && <span className="-mt-1 text-[11px] text-muted tabular-nums">{reachedAt(i)}</span>}
            </li>
          );
        })}
      </ol>

      {rider && step >= 0 && (
        <div className="flex items-center gap-3 border-t border-border pt-4">
          <Avatar photoUrl={rider.photoUrl} name={rider.name} size={48} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-ink">{rider.name}</p>
            <p className="truncate text-xs text-muted">
              {rider.rating.average !== null ? `★ ${rider.rating.average} (${rider.rating.count})` : t("noRating")}
              {order.vehicle && tv.has(order.vehicle) ? ` · ${tv(order.vehicle)}` : ""}
            </p>
          </div>
          {order.matchId && step < 3 && (
            <>
              <CallButton matchId={order.matchId} name={rider.name} photoUrl={rider.photoUrl} />
              <Link href={`/messages?match=${order.matchId}`} className={ui.buttonSecondary + " shrink-0"}>
                {t("message")}
              </Link>
            </>
          )}
        </div>
      )}

      {order.status === "completed" && (
        <div className="flex flex-col gap-3 border-t border-border pt-1">
          {order.matchId && rider && <RatingButton matchId={order.matchId} counterpartName={name} startOpen />}
          <Link href={`/orders/new?again=${order.id}`} className={ui.buttonPrimary + " self-start"}>
            {t("orderAgain")}
          </Link>
        </div>
      )}
    </section>
  );
}
