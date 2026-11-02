"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ui } from "@/lib/ui";
import { getJson, request } from "@/lib/request";
import { AVAILABILITY_DOT, OrderStatusBadge, placeLabel, useOrderTitle, useServiceLabel } from "@/components/orders/order-bits";
import type { OrderSummary } from "@/lib/errand-order-view";

type Incoming = OrderSummary & { myStatus: string; myPriceUsd: number | null; distanceKm: number | null };
type Availability = { status: "available" | "busy" | "offline" | "suspended"; availableNow: boolean } | null;
type Mine = { canOrder: boolean; orders: OrderSummary[] };
type ProviderLists = {
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
    if (body?.availability) setAvailability(body.availability);
    setSwitching(false);
  }

  const row = (o: OrderSummary, extra?: React.ReactNode) => (
    <Link key={o.id} href={`/orders/${o.id}`} className={ui.cardHover + " block p-4"}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted">
            {orderTitle(o.number, o.category)} · {serviceLabel(o.service, o.category)}
          </p>
          <p className="mt-1 truncate font-medium text-ink">{o.description}</p>
          <p className="mt-1 text-sm text-muted">
            {placeLabel(o.pickupDistrict, locale)}
            {o.dropoffDistrict ? ` → ${placeLabel(o.dropoffDistrict, locale)}` : ""}
          </p>
        </div>
        <OrderStatusBadge status={o.status} category={o.category} />
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
        {shownTab === "seeker" && (
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
            <Link href="/quotes/new" className={ui.buttonSecondary}>
              {t("newQuote")}
            </Link>
            {mine?.canOrder && (
              <Link href="/orders/new" className={ui.buttonPrimary}>
                {t("newOrder")}
              </Link>
            )}
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

      {shownTab === "seeker" && mine && !mine.canOrder && (
        <div className={ui.card + " flex items-center justify-between gap-3 p-4"}>
          <p className="text-sm text-muted">{t("needRequestProfile")}</p>
          <Link href="/categories/errands/onboarding?role=seeker" className={ui.buttonSecondary + " shrink-0"}>
            {t("createRequestProfile")}
          </Link>
        </div>
      )}

      {shownTab === "seeker" && mine && (
        <div className="flex flex-col gap-3">
          {mine.orders.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">{t("noOrders")}</p>
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
                row(
                  o,
                  <p className="mt-2 text-sm text-ink/80">
                    {o.distanceKm !== null ? t("kmAway", { km: o.distanceKm }) : ""}
                    {o.myStatus === "offered" && o.myPriceUsd !== null ? ` · ${t("yourOffer")}: ${t("price", { price: o.myPriceUsd })}` : ""}
                  </p>,
                ),
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
