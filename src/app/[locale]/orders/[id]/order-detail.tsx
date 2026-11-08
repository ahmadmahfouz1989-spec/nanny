"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { ui } from "@/lib/ui";
import { request } from "@/lib/request";
import RatingButton from "@/components/matches/rating-button";
import LiveTracking from "@/components/orders/live-tracking";
import { Avatar } from "@/app/[locale]/feed/feed-shared";
import {
  Countdown,
  OrderStatusBadge,
  useDistanceLabel,
  useOrderTitle,
  useSecondsLeft,
  useServiceLabel,
  useStatusLabel,
} from "@/components/orders/order-bits";
import type { OrderOffer, OrderPerson, OrderView } from "@/lib/errand-order-view";
import OrderPlaces from "@/components/orders/order-places";

// One order, live: polled every few seconds so offers and each stage
// appear without a refresh (and a notification arrives as well).
const POLL_MS = 5_000;
const STAGES = ["accepted", "on_the_way", "arrived", "picked_up", "delivered", "completed"] as const;
// A repair job has nothing to pick up.
const JOB_STAGES = ["accepted", "on_the_way", "arrived", "delivered", "completed"] as const;
const stagesFor = (category: string): readonly string[] => (category === "maintenance" ? JOB_STAGES : STAGES);
const nextStage = (status: string, category: string) => {
  const stages = stagesFor(category);
  const i = stages.indexOf(status);
  return i >= 0 && i < stages.length - 1 ? stages[i + 1]! : null;
};
const CANCELLABLE = new Set(["open", "reserved", "accepted", "on_the_way", "arrived"]);
const DROPPABLE = new Set(["accepted", "on_the_way", "arrived"]);

export default function OrderDetail({ orderId }: { orderId: string }) {
  const t = useTranslations("Orders");
  const serviceLabel = useServiceLabel();
  const orderTitle = useOrderTitle();
  const format = useFormatter();
  const router = useRouter();
  const [order, setOrder] = useState<OrderView | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<"cancel" | "drop" | null>(null);

  // A missing order (or one that isn't theirs) says so; a failed load (weak
  // signal) keeps what's on screen and tries again on the next tick.
  const fetchOrder = useCallback(async (): Promise<OrderView | null | "failed"> => {
    const res = await request(`/api/errand-orders/${orderId}`);
    if (!res) return "failed";
    if (res.status === 404 || res.status === 403) return null;
    if (!res.ok) return "failed";
    const body = (await res.json().catch(() => null)) as { order?: OrderView } | null;
    return body?.order ?? "failed";
  }, [orderId]);
  const load = useCallback(
    () =>
      fetchOrder().then((o) => {
        if (o !== "failed") setOrder(o);
      }),
    [fetchOrder],
  );

  useEffect(() => {
    let active = true;
    const tick = () =>
      fetchOrder().then((o) => {
        if (active && o !== "failed") setOrder(o);
      });
    void tick();
    const timer = setInterval(() => void tick(), POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [fetchOrder]);

  async function act(action: string, body: Record<string, unknown> = {}) {
    setBusy(true);
    setError(null);
    const res = await request(`/api/errand-orders/${orderId}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res?.json().catch(() => null);
    // The rider's next-step button stays where it was; a short pause stops
    // a double tap from skipping a step ("on the way" → "arrived").
    if (action === "advance" && res?.ok) await new Promise((r) => setTimeout(r, 1500));
    setBusy(false);
    setConfirming(null);
    if (!res?.ok) {
      setError(typeof data?.error === "string" ? data.error : t("error"));
      return false;
    }
    if (data?.orderId && data.orderId !== orderId) {
      router.push(`/orders/${data.orderId}`);
      return true;
    }
    await load();
    return true;
  }

  if (order === undefined) return <div className="mx-auto w-full max-w-2xl px-4 py-6 text-sm text-muted">…</div>;
  if (order === null) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col items-start gap-3 px-4 py-6">
        <h1 className="text-xl font-bold text-ink">{t("unavailableTitle")}</h1>
        <p className="text-sm text-muted">{t("unavailableBody")}</p>
        <Link href="/orders" className={ui.buttonSecondary}>
          {t("back")}
        </Link>
      </div>
    );
  }

  const confirmBox = (kind: "cancel" | "drop") =>
    confirming === kind ? (
      <div className={ui.card + " flex flex-col gap-3 p-4"}>
        <p className="text-sm text-ink">{kind === "cancel" ? t("cancelConfirm") : t("dropConfirm")}</p>
        <div className="flex gap-2">
          <button type="button" disabled={busy} className={ui.buttonPrimary} onClick={() => act("cancel")}>
            {t("yesCancel")}
          </button>
          <button type="button" className={ui.buttonSecondary} onClick={() => setConfirming(null)}>
            {t("keep")}
          </button>
        </div>
      </div>
    ) : (
      <button type="button" className={ui.buttonGhost + " self-start text-danger!"} onClick={() => setConfirming(kind)}>
        {kind === "cancel" ? t("cancelOrder") : t("dropOrder")}
      </button>
    );

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6">
      <div>
        <Link href={order.viewer === "provider" ? "/orders?tab=provider" : "/orders"} className="text-sm text-muted hover:text-ink">
          <span aria-hidden className="inline-block rtl:-scale-x-100">←</span> {t("back")}
        </Link>
        <div className="mt-2 flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted">{serviceLabel(order.service, order.category)}</p>
            <h1 className="text-2xl font-bold text-ink">{orderTitle(order.number, order.category)}</h1>
          </div>
          <OrderStatusBadge
            status={order.status}
            category={order.category}
            choosing={order.viewer === "seeker" && !!order.matching?.chooseUntil && order.offers.some((o) => o.status === "offered")}
          />
        </div>
      </div>

      <div className={ui.card + " flex flex-col gap-2 p-4"}>
        <p dir="auto" className="whitespace-pre-line text-ink">
          {order.description}
        </p>
        {order.photoUrls.length > 0 && (
          <div className="flex flex-wrap gap-2 py-1">
            {order.photoUrls.map((url) => (
              <a key={url} href={url} target="_blank" rel="noreferrer" className="block h-24 w-24 overflow-hidden rounded-xl border border-border">
                {/* Short-lived private links: next/image can't optimise them. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="h-full w-full object-cover" />
              </a>
            ))}
          </div>
        )}
        <p className="text-sm text-muted">
          {order.timing === "asap"
            ? t("asap")
            : order.scheduledAt
              ? t("scheduledFor", { date: format.dateTime(new Date(order.scheduledAt), { dateStyle: "medium", timeStyle: "short" }) })
              : t("scheduled")}
          {order.budgetUsd !== null ? ` · ${t("budgetLine", { budget: order.budgetUsd })}` : ""}
        </p>
      </div>

      {/* From and To (or Where), with the map and directions. */}
      <OrderPlaces
        pickup={order.pickup}
        dropoff={order.dropoff}
        route={order.route}
        job={order.category === "maintenance"}
        rider={order.viewer === "provider"}
        live={
          order.riderAt && order.provider
            ? { ...order.riderAt, name: order.provider.name.split(" ")[0] || order.provider.name, toward: order.status === "picked_up" ? "dropoff" : "pickup" }
            : null
        }
      />
      {/* The rider doing it: their position goes to the customer while it's in progress. */}
      {order.assignedToMe && order.category === "errands" && ["accepted", "on_the_way", "arrived", "picked_up"].includes(order.status) && (
        <LiveTracking orderId={order.id} />
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      {order.viewer === "seeker" ? (
        <SeekerPart order={order} busy={busy} act={act} confirmBox={confirmBox} />
      ) : (
        <ProviderPart order={order} busy={busy} act={act} confirmBox={confirmBox} />
      )}

      {order.viewer === "seeker" && order.asked.length > 0 && <AskedList order={order} />}

      {stagesFor(order.category).includes(order.status) && <Timeline order={order} />}
    </div>
  );
}

type PartProps = {
  order: OrderView;
  busy: boolean;
  act: (action: string, body?: Record<string, unknown>) => Promise<boolean>;
  confirmBox: (kind: "cancel" | "drop") => React.ReactNode;
};

/**
 * Who the order went to and what each did: opened by itself when nobody
 * could take it, so the customer can message one of them directly.
 */
function AskedList({ order }: { order: OrderView }) {
  const t = useTranslations("Orders");
  return (
    <details open={order.status === "no_provider"} className={ui.card + " group p-4"}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold text-ink [&::-webkit-details-marker]:hidden">
        {t("askedTitle", { count: order.asked.length })}
        <span aria-hidden className="text-muted transition-transform group-open:rotate-180">⌄</span>
      </summary>
      <ul className="mt-3 flex flex-col divide-y divide-border">
        {order.asked.map((p) => (
          <li key={p.profileId}>
            <Link href={`/u/${p.profileId}`} className="flex items-center gap-3 py-2.5">
              <Avatar photoUrl={p.photoUrl} name={p.name} size={40} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-ink">{p.name}</span>
                <span className="block text-xs text-muted">
                  {t(`asked_${p.status}`)}
                  {p.distanceKm !== null ? ` · ${t("askedKm", { km: p.distanceKm })}` : ""}
                </span>
              </span>
              <span aria-hidden className="text-muted rtl:rotate-180">›</span>
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}

function PersonCard({ title, person, matchId, rate = false }: { title: string; person: OrderPerson | null; matchId: string | null; rate?: boolean }) {
  const t = useTranslations("Orders");
  if (!person) return null;
  return (
    <div className={ui.card + " p-4"}>
      <div className="flex items-center gap-3">
        <Avatar photoUrl={person.photoUrl} name={person.name} size={48} />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted">{title}</p>
          <p className="truncate font-semibold text-ink">{person.name}</p>
          <p className="text-xs text-muted">{person.rating.average !== null ? `★ ${person.rating.average} (${person.rating.count})` : t("noRating")}</p>
        </div>
        {matchId && (
          <Link href={`/messages?match=${matchId}`} className={ui.buttonSecondary + " shrink-0"}>
            {t("message")}
          </Link>
        )}
      </div>
      {/* Done: ask how it went, while it's fresh. */}
      {rate && matchId && <RatingButton matchId={matchId} counterpartName={person.name} />}
    </div>
  );
}

function SeekerPart({ order, busy, act, confirmBox }: PartProps) {
  const t = useTranslations("Orders");
  const format = useFormatter();
  const job = order.category === "maintenance";
  const distance = useDistanceLabel();
  const [sort, setSort] = useState<"price" | "rating" | "time">("price");
  const m = order.matching;
  const waveLeft = useSecondsLeft(order.status === "open" && !m?.chooseUntil ? m?.waveUntil : null, order.serverNow);
  const chooseLeft = useSecondsLeft(order.status === "open" ? m?.chooseUntil : null, order.serverNow);
  const confirmLeft = useSecondsLeft(order.status === "reserved" ? m?.confirmUntil : null, order.serverNow);
  const offers = useMemo(() => {
    const list = order.offers.filter((o) => o.status === "offered" || o.status === "selected");
    const key: Record<typeof sort, (o: OrderOffer) => number> = {
      price: (o) => o.priceUsd ?? Infinity,
      rating: (o) => -(o.rating.average ?? 0),
      time: (o) => (job ? (o.visitAt ? Date.parse(o.visitAt) : Infinity) : (o.etaMinutes ?? Infinity)),
    };
    return [...list].sort((a, b) => key[sort](a) - key[sort](b));
  }, [order.offers, sort, job]);

  if (order.status === "no_provider") {
    return (
      <div className={ui.card + " flex flex-col items-start gap-3 p-4"}>
        <p className="font-medium text-ink">{order.sentTo === 0 ? t("noProviderNobodyTitle") : t("noProviderAskedTitle", { count: order.sentTo })}</p>
        <p className="text-sm text-muted">{order.sentTo === 0 ? t("noProviderNobodyBody") : t("noProviderAskedBody")}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} className={ui.buttonPrimary} onClick={() => act("retry")}>
            {t("tryAgain")}
          </button>
          <Link href={`/browse/${order.category}`} className={ui.buttonSecondary}>
            {t("noProviderSeeProviders")}
          </Link>
        </div>
      </div>
    );
  }

  if (order.status === "cancelled") {
    return (
      <div className={ui.card + " flex flex-col items-start gap-3 p-4"}>
        <p className="text-sm text-muted">{order.cancelReason ?? t("cancelledLine")}</p>
        <button type="button" disabled={busy} className={ui.buttonSecondary} onClick={() => act("retry")}>
          {t("tryAgain")}
        </button>
      </div>
    );
  }

  if (order.status === "open") {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold text-ink">{job ? t("quotes") : t("offers")}</h2>
          {offers.length > 1 && (
            <label className="flex items-center gap-2 text-xs text-muted">
              {t("sortBy")}
              <select className="bg-transparent font-medium text-ink outline-none" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
                <option value="price">{t("sortPrice")}</option>
                <option value="rating">{t("sortRating")}</option>
                <option value="time">{job ? t("sortVisit") : t("sortTime")}</option>
              </select>
            </label>
          )}
        </div>
        {m && offers.length > 0 && chooseLeft !== null && (
          <p className="rounded-xl bg-primary-soft px-3 py-2 text-sm text-ink">
            {t.rich("chooseWithin", { time: () => <Countdown seconds={chooseLeft} /> })}
          </p>
        )}
        {m && offers.length > 0 && chooseLeft === null && waveLeft !== null && waveLeft > 0 && (
          <p className="text-sm text-muted">{t.rich("moreOffersFor", { time: () => <Countdown seconds={waveLeft} /> })}</p>
        )}
        {offers.length === 0 ? (
          m ? (
            <div className="flex flex-col gap-1 text-sm text-muted">
              <p>
                {order.counts.waiting > 0
                  ? m.radiusKm !== null
                    ? t("askingNearest", { count: order.counts.waiting, km: m.radiusKm })
                    : t("waitingOffers", { count: order.counts.waiting })
                  : t("searchingMore")}
              </p>
              {waveLeft !== null && waveLeft > 0 && order.counts.waiting > 0 && (
                <p>{t.rich("nextWaveIn", { time: () => <Countdown seconds={waveLeft} /> })}</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted">
              {order.counts.sent > 0 ? t("waitingQuotes", { count: order.counts.sent }) : t("findingPros")}
            </p>
          )
        ) : (
          offers.map((o) => (
            <div key={o.recipientId} className={ui.card + " flex items-center gap-3 p-4"}>
              <Avatar photoUrl={o.photoUrl} name={o.name} size={44} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-ink">{o.name}</p>
                <p className="text-xs text-muted">
                  {o.rating.average !== null ? `★ ${o.rating.average} (${o.rating.count})` : t("noRating")}
                  {o.distanceKm !== null ? ` · ${distance(o.distanceKm)}` : ""}
                </p>
                {o.note && (
                  <p dir="auto" className="mt-1 text-sm text-ink/80">
                    {o.note}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                {/* Left-to-right, or Arabic pages show "$25–$15". */}
                <p dir="ltr" className="text-lg font-bold text-ink">
                  {o.priceMaxUsd ? t("priceRange", { min: o.priceUsd ?? 0, max: o.priceMaxUsd }) : t("price", { price: o.priceUsd ?? 0 })}
                </p>
                <p className="text-xs text-muted">
                  {job
                    ? o.visitAt
                      ? t("visitOn", { date: format.dateTime(new Date(o.visitAt), { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) })
                      : ""
                    : t("eta", { minutes: o.etaMinutes ?? 0 })}
                </p>
                <button type="button" disabled={busy} className={ui.buttonPrimary + " px-4! py-1.5!"} onClick={() => act("select", { recipientId: o.recipientId })}>
                  {t("choose")}
                </button>
              </div>
            </div>
          ))
        )}
        {confirmBox("cancel")}
      </div>
    );
  }

  if (order.status === "reserved") {
    return (
      <div className="flex flex-col gap-3">
        <div className={ui.card + " flex flex-col items-start gap-3 p-4"}>
          <p className="text-sm text-ink">{t("waitingConfirm", { name: order.provider?.name ?? "" })}</p>
          {confirmLeft !== null && (
            <p className="text-sm text-muted">{t.rich("confirmLeftSeeker", { time: () => <Countdown seconds={confirmLeft} /> })}</p>
          )}
          <button type="button" disabled={busy} className={ui.buttonSecondary} onClick={() => act("change")}>
            {job ? t("chooseAnotherQuote") : t("chooseAnother")}
          </button>
        </div>
        {confirmBox("cancel")}
      </div>
    );
  }

  // Confirmed and on its way.
  return (
    <div className="flex flex-col gap-3">
      <PersonCard title={t("yourProvider")} person={order.provider} matchId={order.matchId} rate={order.status === "completed"} />
      {order.status === "delivered" && (
        <button type="button" disabled={busy} className={ui.buttonPrimary} onClick={() => act("complete")}>
          {job ? t("markJobComplete") : t("markComplete")}
        </button>
      )}
      {CANCELLABLE.has(order.status) && confirmBox("cancel")}
    </div>
  );
}

// "2026-11-03T15:30" for a datetime-local input, in the viewer's own time zone.
const localInput = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

function ProviderPart({ order, busy, act, confirmBox }: PartProps) {
  const t = useTranslations("Orders");
  const format = useFormatter();
  const job = order.category === "maintenance";
  const distance = useDistanceLabel();
  const mine = order.mine;
  const [price, setPrice] = useState(mine?.priceUsd ? String(mine.priceUsd) : "");
  const [priceMax, setPriceMax] = useState(mine?.priceMaxUsd ? String(mine.priceMaxUsd) : "");
  const [eta, setEta] = useState(mine?.etaMinutes ? String(mine.etaMinutes) : "");
  const [visitAt, setVisitAt] = useState(localInput(mine?.visitAt));
  const [note, setNote] = useState(mine?.note ?? "");
  const priceText = (min: number, max: number | null | undefined) => (max ? t("priceRange", { min, max }) : t("price", { price: min }));
  const respondLeft = useSecondsLeft(mine?.respondBy, order.serverNow);
  const confirmLeft = useSecondsLeft(order.assignedToMe && order.status === "reserved" ? order.matching?.confirmUntil : null, order.serverNow);

  if (order.assignedToMe && order.status === "reserved") {
    return (
      <div className={ui.card + " flex flex-col gap-3 p-4"}>
        <p className="text-sm text-ink">{t("chosenConfirm")}</p>
        {confirmLeft !== null && (
          <p className="rounded-xl bg-primary-soft px-3 py-2 text-sm text-ink">
            {t.rich("confirmWithin", { time: () => <Countdown seconds={confirmLeft} /> })}
          </p>
        )}
        {mine?.priceUsd !== null && mine?.priceUsd !== undefined && (
          <p className="text-sm text-muted">
            {job ? t("yourQuote") : t("yourOffer")}: <bdi dir="ltr">{priceText(mine.priceUsd, mine.priceMaxUsd)}</bdi> ·{" "}
            {job && mine.visitAt
              ? format.dateTime(new Date(mine.visitAt), { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
              : t("eta", { minutes: mine.etaMinutes ?? 0 })}
          </p>
        )}
        <div className="flex gap-2">
          <button type="button" disabled={busy} className={ui.buttonPrimary} onClick={() => act("confirm")}>
            {t("confirm")}
          </button>
          <button type="button" disabled={busy} className={ui.buttonSecondary} onClick={() => act("refuse")}>
            {t("cantTake")}
          </button>
        </div>
      </div>
    );
  }

  const next = nextStage(order.status, order.category);
  if (order.assignedToMe && next) {
    return (
      <div className="flex flex-col gap-3">
        <PersonCard title={t("customer")} person={order.customer} matchId={order.matchId} />
        <button type="button" disabled={busy} className={ui.buttonPrimary} onClick={() => act("advance")}>
          {job && next === "delivered" ? t("jobNext_delivered") : t(`next_${next}` as "next_on_the_way")}
        </button>
        {DROPPABLE.has(order.status) && confirmBox("drop")}
      </div>
    );
  }

  if (order.assignedToMe) {
    return <PersonCard title={t("customer")} person={order.customer} matchId={order.matchId} rate={order.status === "completed"} />;
  }

  if (mine?.status === "expired") return <p className="text-sm text-muted">{t("timeUp")}</p>;
  if (mine?.status === "offer_expired") return <p className="text-sm text-muted">{t("offerLapsed")}</p>;
  if (order.status !== "open" || !mine || mine.status === "not_selected" || mine.status === "refused") {
    return <p className="text-sm text-muted">{job ? t("notSelectedJob") : t("notSelected")}</p>;
  }

  const canSend = !!price && (job ? !!visitAt : !!eta);
  const send = () =>
    act(
      "offer",
      job
        ? {
            priceUsd: Number(price),
            priceMaxUsd: priceMax ? Number(priceMax) : undefined,
            visitAt: new Date(visitAt).toISOString(),
            note: note.trim() || undefined,
          }
        : { priceUsd: Number(price), etaMinutes: Number(eta), note: note.trim() || undefined },
    );

  return (
    <div className={ui.card + " flex flex-col gap-3 p-4"}>
      <h2 className="font-semibold text-ink">{job ? t("yourQuote") : t("yourOffer")}</h2>
      {mine.distanceKm !== null && <p className="text-sm text-muted">{distance(mine.distanceKm)}</p>}
      {respondLeft !== null && (
        <p className="rounded-xl bg-primary-soft px-3 py-2 text-sm text-ink">
          {t.rich("answerWithin", { time: () => <Countdown seconds={respondLeft} /> })}
        </p>
      )}
      {mine.status === "declined" && <p className="text-sm text-muted">{t("declined")}</p>}
      {job ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className={ui.label}>{t("priceFromUsd")}</span>
              <input type="number" min={1} max={10000} step="1" inputMode="decimal" className={ui.input} value={price} onChange={(e) => setPrice(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className={ui.label}>{t("priceMaxUsd")}</span>
              <input type="number" min={1} max={10000} step="1" inputMode="decimal" className={ui.input} value={priceMax} onChange={(e) => setPriceMax(e.target.value)} />
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className={ui.label}>{t("visitAt")}</span>
            <input type="datetime-local" className={ui.input} min={localInput(new Date().toISOString())} value={visitAt} onChange={(e) => setVisitAt(e.target.value)} />
          </label>
        </>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className={ui.label}>{t("priceUsd")}</span>
            <input type="number" min={0.5} max={10000} step="0.5" inputMode="decimal" className={ui.input} value={price} onChange={(e) => setPrice(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={ui.label}>{t("etaMinutes")}</span>
            <input type="number" min={5} max={1440} step="5" inputMode="numeric" className={ui.input} value={eta} onChange={(e) => setEta(e.target.value)} />
          </label>
        </div>
      )}
      <label className="flex flex-col gap-1">
        <span className={ui.label}>{t("note")}</span>
        <input dir="auto" maxLength={300} className={ui.input} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy || !canSend} className={ui.buttonPrimary} onClick={send}>
          {mine.status === "offered" ? (job ? t("updateQuote") : t("updateOffer")) : job ? t("sendQuote") : t("sendOffer")}
        </button>
        {mine.status === "sent" && (
          <button type="button" disabled={busy} className={ui.buttonSecondary} onClick={() => act("decline")}>
            {t("decline")}
          </button>
        )}
        {mine.status === "offered" && (
          <button type="button" disabled={busy} className={ui.buttonSecondary} onClick={() => act("withdraw")}>
            {job ? t("withdrawQuote") : t("withdraw")}
          </button>
        )}
      </div>
    </div>
  );
}

function Timeline({ order }: { order: OrderView }) {
  const t = useTranslations("Orders");
  const statusLabel = useStatusLabel();
  const format = useFormatter();
  const reached = new Map(order.timeline.map((s) => [s.status, s.at]));
  const stages = stagesFor(order.category);
  const current = stages.indexOf(order.status);
  return (
    <div className={ui.card + " p-4"}>
      <h2 className="mb-3 font-semibold text-ink">{t("progress")}</h2>
      <ol className="flex flex-col gap-3">
        {stages.map((stage, i) => {
          const done = i <= current;
          const at = reached.get(stage);
          return (
            <li key={stage} className="flex items-center gap-3">
              <span className={`h-3 w-3 shrink-0 rounded-full ${done ? (i === current ? "bg-primary" : "bg-success") : "bg-border"}`} />
              <span className={`flex-1 text-sm ${done ? "font-medium text-ink" : "text-muted"}`}>{statusLabel(stage, order.category)}</span>
              {done && at && <span className="text-xs text-muted">{format.dateTime(new Date(at), { timeStyle: "short" })}</span>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
