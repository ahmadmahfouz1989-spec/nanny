"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ChevronIcon, ScooterIcon, WrenchIcon } from "@/components/home-icons";
import { ui } from "@/lib/ui";
import { getJson, request } from "@/lib/request";
import { RIDER_AVAILABILITY_EVENT, setSharing, shareLocationOnce, stopSharing, type ShareResult } from "@/lib/rider-location";
import {
  AVAILABILITY_DOT,
  Countdown,
  OrderStatusBadge,
  placeLabel,
  useDistanceLabel,
  useOrderTitle,
  useSecondsLeft,
  useServiceLabel,
} from "@/components/orders/order-bits";
import type { OrderSummary } from "@/lib/errand-order-view";

type Incoming = OrderSummary & { myStatus: string; myPriceUsd: number | null; distanceKm: number | null; respondBy: string | null };
type Availability = { status: "available" | "busy" | "offline" | "suspended"; availableNow: boolean; needsArea?: boolean; located?: boolean } | null;
type Mine = { canOrder: boolean; orders: OrderSummary[] };
type ProviderLists = {
  serverNow?: string;
  provider: { rider?: boolean; tradesperson?: boolean } | null;
  incoming: Incoming[];
  assigned: OrderSummary[];
};

const LIVE = new Set(["open", "reserved", "accepted", "on_the_way", "arrived", "picked_up", "delivered"]);
const POLL_MS = 10_000;

export default function OrdersClient({ initialTab }: { initialTab: "seeker" | "provider" }) {
  const t = useTranslations("Orders");
  const serviceLabel = useServiceLabel();
  const orderTitle = useOrderTitle();
  const locale = useLocale();
  const [tab, setTab] = useState(initialTab);
  const [mine, setMine] = useState<Mine | null>(null);
  const [provider, setProvider] = useState<ProviderLists | null>(null);
  const [availability, setAvailability] = useState<Availability>(null);
  const [switching, setSwitching] = useState(false);
  // A provider who can't order lands on their requests, not an empty "my orders".
  const pickedTab = useRef(initialTab === "provider");

  const apply = useCallback((m: Mine | null, p: ProviderLists | null, a: { availability: Availability } | null) => {
    if (m) setMine(m);
    if (p) setProvider(p);
    if (!pickedTab.current && p?.provider && m && !m.canOrder) setTab("provider");
    pickedTab.current = true;
    setAvailability(a?.availability ?? null);
  }, []);

  useEffect(() => {
    let active = true;
    const tick = () =>
      Promise.all([
        getJson<Mine>("/api/errand-orders?as=seeker"),
        getJson<ProviderLists>("/api/errand-orders?as=provider"),
        getJson<{ availability: Availability }>("/api/errand-availability"),
      ]).then(([m, p, a]) => {
        if (active) apply(m, p, a);
      });
    void tick();
    const timer = setInterval(() => void tick(), POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [apply]);

  const isProvider = !!provider?.provider;
  const shownTab = isProvider ? tab : "seeker";

  async function toggleAvailability() {
    if (!availability) return;
    setSwitching(true);
    const res = await request("/api/errand-availability", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ available: !availability.availableNow }),
    });
    const body = await res?.json().catch(() => null);
    if (body?.availability) {
      setAvailability(body.availability);
      // The app frame starts or stops sending where the phone is.
      window.dispatchEvent(new CustomEvent(RIDER_AVAILABILITY_EVENT, { detail: !!body.availability.availableNow }));
    }
    setSwitching(false);
  }

  const row = (o: OrderSummary, extra?: React.ReactNode) => (
    <Link key={o.id} href={`/orders/${o.id}`} className={ui.cardHover + " block p-4"}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted">
            {orderTitle(o.number, o.category)} · {serviceLabel(o.service, o.category)}
          </p>
          <p dir="auto" className="mt-1 truncate text-start font-medium text-ink">{o.description}</p>
          <p className="mt-1 text-sm text-muted">
            {placeLabel(o.pickupDistrict, locale)}
            {o.dropoffDistrict && (
              <>
                {" "}
                <span aria-hidden className="inline-block rtl:-scale-x-100">→</span> {placeLabel(o.dropoffDistrict, locale)}
              </>
            )}
          </p>
        </div>
        <OrderStatusBadge status={o.status} category={o.category} choosing={o.choosing} />
      </div>
      {extra}
    </Link>
  );

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted">{t("subtitle")}</p>
        </div>
        {shownTab === "seeker" && !(mine && mine.orders.length === 0) && (
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
            <Link href="/quotes/new" className={ui.buttonSecondary}>
              {t("newQuote")}
            </Link>
            <Link href="/orders/new" className={ui.buttonPrimary}>
              {t("newOrder")}
            </Link>
          </div>
        )}
      </div>

      {isProvider && (
        <div className="flex gap-1 rounded-xl bg-surface-sunken p-1">
          <button type="button" className={ui.toggleTab(shownTab === "seeker")} onClick={() => {
              pickedTab.current = true;
              setTab("seeker");
            }}>
            {t("myOrders")}
          </button>
          <button type="button" className={ui.toggleTab(shownTab === "provider")} onClick={() => setTab("provider")}>
            {t("incoming")}
            {provider && provider.incoming.length > 0 ? ` (${provider.incoming.length})` : ""}
          </button>
        </div>
      )}

      {shownTab === "seeker" && mine && (
        <div className="flex flex-col gap-3">
          {mine.orders.length === 0 ? (
            <div className="flex flex-col gap-3 pt-2">
              <h2 className="font-display text-lg font-semibold text-ink">{t("emptyTitle")}</h2>
              <StartCard href="/orders/new" icon={<ScooterIcon className="h-6 w-6" />} tone="bg-primary-soft text-primary" title={t("newOrder")} body={t("emptyDeliveryBody")} />
              <StartCard href="/quotes/new" icon={<WrenchIcon className="h-6 w-6" />} tone="bg-accent-soft text-accent-hover" title={t("newQuote")} body={t("emptyQuoteBody")} />
            </div>
          ) : (
            mine.orders.map((o) =>
              row(
                o,
                LIVE.has(o.status) && o.status === "open" ? (
                  <p className="mt-2 text-sm text-ink/80">
                    {o.category === "maintenance" ? t("quotesCount", { count: o.offers }) : t("offersCount", { count: o.offers })}
                  </p>
                ) : null,
              ),
            )
          )}
        </div>
      )}

      {shownTab === "provider" && provider && (
        <div className="flex flex-col gap-4">
          {availability?.needsArea && !availability.located && provider.provider?.rider && <NeedsAreaCard />}
          {availability && provider.provider?.rider && (
            <div className={ui.card + " flex items-center justify-between gap-3 p-4"}>
              <div className="min-w-0">
                <p className="text-xs text-muted">{t("availability")}</p>
                <p className="mt-0.5 flex items-center gap-2 font-semibold text-ink">
                  <span className={`inline-block h-2.5 w-2.5 rounded-full ${AVAILABILITY_DOT[availability.status]}`} />
                  {t(`status_${availability.status}`)}
                </p>
                <p className="mt-1 text-sm text-muted">{t(`${availability.status}Hint`)}</p>
              </div>
              {(availability.status === "available" || availability.status === "offline") && (
                <button type="button" onClick={toggleAvailability} disabled={switching} className={(availability.availableNow ? ui.buttonSecondary : ui.buttonPrimary) + " shrink-0"}>
                  {availability.availableNow ? t("goOffline") : t("goAvailable")}
                </button>
              )}
            </div>
          )}
          {availability?.availableNow && provider.provider?.rider && (
            <LocationRow located={!!availability.located} onShared={() => setAvailability((a) => (a ? { ...a, located: true } : a))} />
          )}

          {provider.assigned.filter((o) => LIVE.has(o.status)).length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className={ui.eyebrow}>{t("active")}</h2>
              {provider.assigned.filter((o) => LIVE.has(o.status)).map((o) => row(o))}
            </section>
          )}

          <section className="flex flex-col gap-3">
            <h2 className={ui.eyebrow}>{t("incoming")}</h2>
            {provider.incoming.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">{provider.provider?.rider ? t("noIncoming") : t("noIncomingJobs")}</p>
            ) : (
              provider.incoming.map((o) =>
                row(o, <IncomingLine order={o} serverNow={provider.serverNow ?? new Date().toISOString()} />),
              )
            )}
          </section>

          {provider.assigned.filter((o) => !LIVE.has(o.status)).length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className={ui.eyebrow}>{t("past")}</h2>
              {provider.assigned.filter((o) => !LIVE.has(o.status)).map((o) => row(o))}
            </section>
          )}
        </div>
      )}
    </div>
  );
}

/** Under a request: how far, the rider's offer, and how long they have left to answer. */
function IncomingLine({ order: o, serverNow }: { order: Incoming; serverNow: string }) {
  const t = useTranslations("Orders");
  const distance = useDistanceLabel();
  const left = useSecondsLeft(o.respondBy, serverNow);
  return (
    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
      <p className="text-ink/80">
        {o.distanceKm !== null ? distance(o.distanceKm) : ""}
        {o.myStatus === "offered" && o.myPriceUsd !== null ? ` · ${t("yourOffer")}: ${t("price", { price: o.myPriceUsd })}` : ""}
      </p>
      {left !== null && left > 0 && (
        <p className="rounded-full bg-primary-soft px-3 py-1 text-ink">{t.rich("answerWithin", { time: () => <Countdown seconds={left} /> })}</p>
      )}
    </div>
  );
}

/** A rider with no district saved gets no requests: say so, and where to fix it. */
/**
 * Whether orders are being matched to where the rider's phone is, and the
 * one tap that turns it on. Turning it off stops it at once.
 */
function LocationRow({ located, onShared }: { located: boolean; onShared: () => void }) {
  const t = useTranslations("Orders");
  const [state, setState] = useState<"idle" | "asking" | ShareResult>("idle");
  const [on, setOn] = useState(located);
  if (located && !on) setOn(true);

  async function share() {
    setState("asking");
    const result = await shareLocationOnce();
    setState(result);
    if (result === "ok") {
      setSharing(true);
      setOn(true);
      onShared();
    }
  }

  if (on) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-secondary-soft/60 px-4 py-3">
        <p className="text-sm text-ink">{t("locationOn")}</p>
        <button
          type="button"
          className={ui.link + " text-sm"}
          onClick={() => {
            stopSharing();
            setOn(false);
            setState("idle");
          }}
        >
          {t("locationStop")}
        </button>
      </div>
    );
  }
  return (
    <div className={ui.card + " flex flex-col gap-2 p-4"}>
      <p className="font-semibold text-ink">{t("locationTitle")}</p>
      <p className="text-sm text-muted">{t("locationBody")}</p>
      {state === "denied" && <p className="text-sm text-danger">{t("locationDenied")}</p>}
      {state === "unavailable" && <p className="text-sm text-danger">{t("locationFailed")}</p>}
      <button type="button" onClick={share} disabled={state === "asking"} className={ui.buttonPrimary + " self-start"}>
        {state === "asking" ? t("locationAsking") : t("locationShare")}
      </button>
    </div>
  );
}

export function NeedsAreaCard() {
  const t = useTranslations("Orders");
  return (
    <Link href="/categories/errands/onboarding?role=provider" className="flex flex-col gap-1 rounded-2xl border border-warning/40 bg-warning-soft p-4">
      <span className="font-semibold text-warning">{t("needsAreaTitle")}</span>
      <span className="text-sm text-ink">{t("needsAreaBody")}</span>
      <span className="text-sm font-semibold text-primary">{t("needsAreaAction")} <span aria-hidden className="inline-block rtl:-scale-x-100">→</span></span>
    </Link>
  );
}

/** One way to start, as a big tappable card: for someone with no orders yet. */
function StartCard({ href, icon, tone, title, body }: { href: string; icon: React.ReactNode; tone: string; title: string; body: string }) {
  return (
    <Link href={href} className={ui.card + " flex items-center gap-4 p-4 transition hover:border-border-strong active:scale-[0.99]"}>
      <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${tone}`}>{icon}</span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-semibold text-ink">{title}</span>
        <span className="text-sm text-muted">{body}</span>
      </span>
      <ChevronIcon className="h-4 w-4 shrink-0 text-muted" />
    </Link>
  );
}
