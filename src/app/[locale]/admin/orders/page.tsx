"use client";

import { useEffect, useState } from "react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { ui } from "@/lib/ui";
import AdminPageHeader from "@/components/admin/admin-page-header";
import { getJson, request } from "@/lib/request";
import { OrderStatusBadge, placeLabel, useServiceLabel } from "@/components/orders/order-bits";
import type { OrderSummary, OrderView } from "@/lib/errand-order-view";

const STATUSES = ["open", "reserved", "accepted", "on_the_way", "arrived", "picked_up", "delivered", "completed", "cancelled", "no_provider"];

/**
 * Delivery & Errands orders for admins: every order, who it went to and
 * what each provider answered, its full history, a hand on the controls
 * (send to more providers, reopen, cancel), and the matching settings.
 */
export default function AdminOrdersPage() {
  const t = useTranslations("Admin");
  const to = useTranslations("Orders");
  const serviceLabel = useServiceLabel();
  const locale = useLocale();
  const format = useFormatter();
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [number, setNumber] = useState("");
  const [orders, setOrders] = useState<OrderSummary[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<OrderView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const qs = new URLSearchParams();
    if (status) qs.set("status", status);
    if (category) qs.set("category", category);
    if (number.trim()) qs.set("number", number.trim().replace(/^#/, ""));
    let active = true;
    getJson<{ orders: OrderSummary[] }>(`/api/admin/errand-orders?${qs}`).then((b) => active && setOrders(b?.orders ?? []));
    return () => {
      active = false;
    };
  }, [status, category, number, reload]);

  useEffect(() => {
    if (!openId) return;
    let active = true;
    getJson<{ order: OrderView }>(`/api/admin/errand-orders/${openId}`).then((b) => active && setDetail(b?.order ?? null));
    return () => {
      active = false;
    };
  }, [openId, reload]);

  async function act(action: "resend" | "reopen" | "cancel") {
    if (!openId) return;
    setBusy(true);
    setError(null);
    const res = await request(`/api/admin/errand-orders/${openId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const body = await res?.json().catch(() => null);
    setBusy(false);
    if (!res?.ok) setError(typeof body?.error === "string" ? body.error : to("error"));
    setReload((n) => n + 1);
  }

  const when = (iso: string) => format.dateTime(new Date(iso), { dateStyle: "short", timeStyle: "short" });

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader title={t("ordersTitle")} description={t("ordersSubtitle")} />
      <SettingsCard />

      <div className="flex flex-wrap gap-2">
        <input className={ui.input + " max-w-40"} placeholder={t("findOrder")} value={number} inputMode="numeric" onChange={(e) => setNumber(e.target.value)} />
        <select className={ui.select + " max-w-56"} value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">{t("allOrderKinds")}</option>
          <option value="errands">{t("kindDeliveries")}</option>
          <option value="maintenance">{t("kindJobs")}</option>
        </select>
        <select className={ui.select + " max-w-56"} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">{t("allStatuses")}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {to(`status_${s}` as "status_open")}
            </option>
          ))}
        </select>
      </div>

      {orders?.length === 0 && <p className="text-sm text-muted">{t("noOrdersAdmin")}</p>}
      <div className="flex flex-col gap-3">
        {orders?.map((o) => (
          <div key={o.id} className={ui.card + " p-4"}>
            <button type="button" className="flex w-full items-start justify-between gap-3 text-start" onClick={() => setOpenId(openId === o.id ? null : o.id)}>
              <div className="min-w-0">
                <p className="text-xs text-muted">
                  #{o.number} · {o.category === "maintenance" ? `${t("kindJobs")} · ` : ""}
                  {serviceLabel(o.service, o.category)} · {when(o.createdAt)}
                </p>
                <p className="mt-1 truncate font-medium text-ink">{o.description}</p>
                <p className="mt-1 text-sm text-muted">
                  {placeLabel(o.pickupDistrict, locale)}
                  {o.dropoffDistrict ? ` → ${placeLabel(o.dropoffDistrict, locale)}` : ""} · {to("sentTo", { count: o.sent })} · {to("offersCount", { count: o.offers })}
                </p>
              </div>
              <OrderStatusBadge status={o.status} category={o.category} />
            </button>

            {openId === o.id && detail?.id === o.id && (
              <div className="mt-4 flex flex-col gap-4 border-t border-border pt-4">
                <p className="text-sm text-muted">
                  {to("customer")}: {detail.customer?.name ?? "—"}
                  {detail.provider ? ` · ${to("yourProvider")}: ${detail.provider.name}` : ""}
                </p>
                {error && <p className="text-sm text-danger">{error}</p>}
                <div className="flex flex-wrap gap-2">
                  {detail.status === "open" && (
                    <button type="button" disabled={busy} className={ui.buttonSecondary} onClick={() => act("resend")}>
                      {t("resend")}
                    </button>
                  )}
                  {(detail.status === "no_provider" || detail.status === "reserved") && (
                    <button type="button" disabled={busy} className={ui.buttonSecondary} onClick={() => act("reopen")}>
                      {t("reopen")}
                    </button>
                  )}
                  {!["completed", "cancelled"].includes(detail.status) && (
                    <button type="button" disabled={busy} className={ui.buttonGhost + " text-danger!"} onClick={() => act("cancel")}>
                      {t("cancelOrderAdmin")}
                    </button>
                  )}
                </div>

                <section>
                  <h3 className={ui.eyebrow}>{t("recipients")}</h3>
                  <table className="mt-2 w-full text-sm">
                    <tbody>
                      {detail.offers.map((r) => (
                        <tr key={r.recipientId} className="border-b border-border last:border-0">
                          <td className="py-1.5 pe-2 text-muted tabular-nums">{r.rank}</td>
                          <td className="py-1.5 pe-2 text-ink">{r.name}</td>
                          <td className="py-1.5 pe-2 text-muted tabular-nums">{r.distanceKm !== null ? `${r.distanceKm} km` : ""}</td>
                          <td className="py-1.5 pe-2">{t(`rec_${r.status}` as "rec_sent")}</td>
                          <td dir="ltr" className="py-1.5 text-end tabular-nums">
                            {r.priceUsd !== null
                              ? `$${r.priceUsd}${r.priceMaxUsd ? `–${r.priceMaxUsd}` : ""} · ${
                                  r.visitAt ? when(r.visitAt) : `${r.etaMinutes} min`
                                }`
                              : ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>

                <section>
                  <h3 className={ui.eyebrow}>{t("history")}</h3>
                  <ol className="mt-2 flex flex-col gap-1 text-sm">
                    {detail.events?.map((e, i) => (
                      <li key={i} className="flex gap-3">
                        <span className="shrink-0 text-muted tabular-nums">{when(e.at)}</span>
                        <span className="text-ink">
                          {e.actorRole} · {e.type}
                          {e.type === "status" ? ` → ${String((e.detail as { status?: string })?.status ?? "")}` : ""}
                          {e.type === "dispatched" ? ` (${String((e.detail as { count?: number })?.count ?? 0)})` : ""}
                        </span>
                      </li>
                    ))}
                  </ol>
                </section>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function SettingsCard() {
  const t = useTranslations("Admin");
  const [values, setValues] = useState<{ maxRecipients: number; openMinutes: number; quoteOpenMinutes: number } | null>(null);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    let active = true;
    getJson<{ settings: { maxRecipients: number; openMinutes: number; quoteOpenMinutes: number } }>("/api/admin/errand-settings").then((b) => active && setValues(b?.settings ?? null));
    return () => {
      active = false;
    };
  }, []);

  async function save() {
    if (!values) return;
    setState("saving");
    const res = await request("/api/admin/errand-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    setState(res?.ok ? "saved" : "error");
  }

  if (!values) return null;
  return (
    <div className={ui.card + " flex flex-col gap-3 p-4"}>
      <h2 className="font-semibold text-ink">{t("ordersSettings")}</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className={ui.label}>{t("maxRecipients")}</span>
          <input
            type="number"
            min={1}
            max={200}
            className={ui.input}
            value={values.maxRecipients}
            onChange={(e) => {
              setState("idle");
              setValues({ ...values, maxRecipients: Number(e.target.value) });
            }}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={ui.label}>{t("openMinutes")}</span>
          <input
            type="number"
            min={5}
            max={1440}
            className={ui.input}
            value={values.openMinutes}
            onChange={(e) => {
              setState("idle");
              setValues({ ...values, openMinutes: Number(e.target.value) });
            }}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={ui.label}>{t("quoteOpenMinutes")}</span>
          <input
            type="number"
            min={60}
            max={10080}
            className={ui.input}
            value={values.quoteOpenMinutes}
            onChange={(e) => {
              setState("idle");
              setValues({ ...values, quoteOpenMinutes: Number(e.target.value) });
            }}
          />
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button type="button" className={ui.buttonPrimary} disabled={state === "saving"} onClick={save}>
          {t("save")}
        </button>
        {state === "saved" && <span className="text-sm text-success">{t("saved")}</span>}
        {state === "error" && <span className="text-sm text-danger">✕</span>}
      </div>
    </div>
  );
}
