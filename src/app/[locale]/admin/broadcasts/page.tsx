"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { ui } from "@/lib/ui";
import AdminPageHeader from "@/components/admin/admin-page-header";
import { getJson, request } from "@/lib/request";

type Totals = { total: number; pending: number; sent: number; no_device: number; failed: number; opened: number };
type Named = { name_en: string; name_ar: string };
type Broadcast = { id: string; title: string; body: string; audience: string; status: string; created_at: string; stale: boolean; categories: Named | null; totals: Totals };
type Category = Named & { id: string };
type Channels = { ios: boolean; android: boolean; web: boolean };
type Provider = {
  user_id: string;
  name: string;
  photo_url: string | null;
  email: string | null;
  phone: string | null;
  place_en: string | null;
  place_ar: string | null;
  categories_en: string[];
  categories_ar: string[];
  devices: number;
};
type Recipient = { user_id: string; name: string; push_status: string; devices_sent: number; devices_failed: number; read_at: string | null };
type AudienceKind = "all_providers" | "category" | "selected";

const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "secondary"> = { sent: "success", no_device: "warning", failed: "danger", pending: "secondary", sending: "secondary" };

/** One message to providers, and what happened to the ones already sent. */
export default function AdminBroadcastsPage() {
  const t = useTranslations("Admin");
  const locale = useLocale();
  const format = useFormatter();
  const named = useCallback((n: Named) => (locale === "ar" ? n.name_ar : n.name_en), [locale]);

  const [broadcasts, setBroadcasts] = useState<Broadcast[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [channels, setChannels] = useState<Channels | null>(null);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<AudienceKind>("all_providers");
  const [categoryId, setCategoryId] = useState("");
  const [picked, setPicked] = useState<Provider[]>([]);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Provider[]>([]);

  // Asked first and shown, because a sent message can't be taken back.
  const [confirming, setConfirming] = useState<number | null>(null);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [openLog, setOpenLog] = useState<string | null>(null);
  const [log, setLog] = useState<Recipient[] | null>(null);

  const load = useCallback(async () => {
    const data = await getJson<{ broadcasts: Broadcast[]; categories: Category[]; channels: Channels }>("/api/admin/broadcasts");
    if (!data) return;
    setBroadcasts(data.broadcasts);
    setCategories(data.categories);
    setChannels(data.channels);
  }, []);

  const loadLog = useCallback(async (id: string) => {
    const data = await getJson<{ recipients: Recipient[] }>(`/api/admin/broadcasts/${id}`);
    setLog(data?.recipients ?? []);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- first load from the API
    void load();
  }, [load]);

  // While anything is going out, the totals keep moving.
  const sending = useMemo(() => (broadcasts ?? []).some((b) => b.status === "sending"), [broadcasts]);
  useEffect(() => {
    if (!sending) return;
    const timer = setInterval(() => {
      void load();
      if (openLog) void loadLog(openLog);
    }, 4000);
    return () => clearInterval(timer);
  }, [sending, load, openLog, loadLog]);

  useEffect(() => {
    if (audience !== "selected" || query.trim().length < 2) return;
    const timer = setTimeout(async () => {
      const data = await getJson<{ providers: Provider[] }>(`/api/admin/broadcasts/providers?q=${encodeURIComponent(query.trim())}`);
      setFound(data?.providers ?? []);
    }, 250);
    return () => clearTimeout(timer);
  }, [audience, query]);

  const target = useMemo(() => {
    if (audience === "category") return { audience, categoryId };
    if (audience === "selected") return { audience, userIds: picked.map((p) => p.user_id) };
    return { audience };
  }, [audience, categoryId, picked]);

  const ready = title.trim().length >= 2 && body.trim().length >= 2 && (audience !== "category" || !!categoryId) && (audience !== "selected" || picked.length > 0);

  function changed() {
    setConfirming(null);
    setError(null);
    setNotice(null);
  }

  async function review() {
    setBusy(true);
    changed();
    const res = await request("/api/admin/broadcasts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preview: true, target }),
    });
    setBusy(false);
    const data = res?.ok ? ((await res.json()) as { recipients: number }) : null;
    if (!data) return setError(t("broadcastError"));
    if (data.recipients === 0) return setError(t("broadcastNoRecipients"));
    setConfirming(data.recipients);
  }

  async function send() {
    setBusy(true);
    setError(null);
    const res = await request("/api/admin/broadcasts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId, title, body, target }),
    });
    setBusy(false);
    if (!res?.ok) {
      setError(res?.status === 422 ? t("broadcastNoRecipients") : t("broadcastError"));
      return;
    }
    const data = (await res.json()) as { recipients: number };
    setNotice(t("broadcastSending", { count: data.recipients }));
    setConfirming(null);
    setTitle("");
    setBody("");
    setPicked([]);
    setQuery("");
    setFound([]);
    setRequestId(crypto.randomUUID());
    void load();
  }

  async function retry(id: string) {
    await request(`/api/admin/broadcasts/${id}/retry`, { method: "POST" });
    void load();
    if (openLog === id) void loadLog(id);
  }

  function toggleLog(id: string) {
    if (openLog === id) {
      setOpenLog(null);
      return;
    }
    setOpenLog(id);
    setLog(null);
    void loadLog(id);
  }

  const off = channels ? [!channels.ios && t("broadcastChannelIos"), !channels.android && t("broadcastChannelAndroid"), !channels.web && t("broadcastChannelWeb")].filter(Boolean) : [];
  const audienceLabel = (b: Broadcast) => (b.audience === "category" && b.categories ? named(b.categories) : b.audience === "selected" ? t("broadcastAudienceSelected") : t("broadcastAudienceAll"));

  return (
    <div>
      <AdminPageHeader title={t("broadcastTitle")} description={t("broadcastDescription")} />

      {off.length > 0 && <p className="mb-4 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">{t("broadcastChannelsOff", { channels: off.join(", ") })}</p>}

      <section className={ui.card + " mb-8 flex flex-col gap-4 p-5"}>
        <div>
          <p className={ui.label + " mb-2"}>{t("broadcastTo")}</p>
          <div className="flex flex-wrap gap-2">
            {(["all_providers", "category", "selected"] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                aria-pressed={audience === kind}
                className={ui.pill(audience === kind)}
                onClick={() => {
                  setAudience(kind);
                  changed();
                }}
              >
                {kind === "all_providers" ? t("broadcastAudienceAll") : kind === "category" ? t("broadcastAudienceCategory") : t("broadcastAudienceSelected")}
              </button>
            ))}
          </div>
        </div>

        {audience === "category" && (
          <select
            aria-label={t("broadcastAudienceCategory")}
            className={ui.select}
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value);
              changed();
            }}
          >
            <option value="">{t("broadcastPickCategory")}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {named(c)}
              </option>
            ))}
          </select>
        )}

        {audience === "selected" && (
          <div className="flex flex-col gap-2">
            <input
              className={ui.input}
              aria-label={t("broadcastSearch")}
              placeholder={t("broadcastSearch")}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (e.target.value.trim().length < 2) setFound([]);
              }}
            />
            {found.length > 0 && (
              <div className="max-h-80 overflow-y-auto rounded-xl border border-border">
                {found.map((p) => {
                  const on = picked.some((x) => x.user_id === p.user_id);
                  return (
                    <button
                      key={p.user_id}
                      type="button"
                      className="flex w-full items-center justify-between gap-3 border-b border-border px-3 py-2 text-start text-sm last:border-0 hover:bg-surface-sunken"
                      onClick={() => {
                        setPicked(on ? picked.filter((x) => x.user_id !== p.user_id) : [...picked, p]);
                        changed();
                      }}
                    >
                      {p.photo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.photo_url} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
                      ) : (
                        <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-sunken font-semibold text-muted">
                          {p.name.trim().charAt(0).toUpperCase()}
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-ink">{p.name}</span>
                        <span className="block truncate text-xs text-muted">
                          {[(locale === "ar" ? p.categories_ar : p.categories_en).join(" · "), locale === "ar" ? p.place_ar : p.place_en].filter(Boolean).join(" · ")}
                        </span>
                        {(p.email || p.phone) && (
                          <bdi dir="ltr" className="block truncate text-xs text-muted">
                            {[p.email, p.phone].filter(Boolean).join(" · ")}
                          </bdi>
                        )}
                        <span className={"block text-xs " + (p.devices > 0 ? "text-success" : "text-warning")}>
                          {p.devices > 0 ? t("broadcastHasDevice", { count: p.devices }) : t("broadcastNoDeviceHint")}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs font-semibold text-primary">{on ? t("broadcastRemove") : t("broadcastAdd")}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {picked.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {picked.map((p) => (
                  <button
                    key={p.user_id}
                    type="button"
                    aria-label={`${t("broadcastRemove")} ${p.name}`}
                    className="rounded-full bg-surface-sunken px-3 py-1 text-xs text-ink"
                    onClick={() => {
                      setPicked(picked.filter((x) => x.user_id !== p.user_id));
                      changed();
                    }}
                  >
                    {p.name} ×
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <label className="flex flex-col gap-1.5">
          <span className={ui.label}>{t("broadcastSubject")}</span>
          <input
            dir="auto"
            className={ui.input}
            maxLength={80}
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              changed();
            }}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={ui.label}>{t("broadcastMessage")}</span>
          <textarea
            dir="auto"
            className={ui.input + " min-h-32"}
            maxLength={2000}
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              changed();
            }}
          />
          <span className="text-xs text-muted">{t("broadcastMessageHint", { count: body.length })}</span>
        </label>

        {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
        {notice && <p className="rounded-lg bg-surface-sunken px-3 py-2 text-sm text-ink">{notice}</p>}

        {confirming === null ? (
          <button type="button" disabled={!ready || busy} onClick={review} className={ui.buttonPrimary + " self-start"}>
            {t("broadcastReview")}
          </button>
        ) : (
          <div className="rounded-xl border border-border p-4">
            <p className="text-sm font-semibold text-ink">{t("broadcastConfirm", { count: confirming })}</p>
            <p className="mt-1 text-xs text-muted">{t("broadcastConfirmNote")}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={send} className={ui.buttonPrimary}>
                {busy ? t("broadcastSendingNow") : t("broadcastSend")}
              </button>
              <button type="button" disabled={busy} onClick={() => setConfirming(null)} className={ui.buttonSecondary}>
                {t("broadcastBack")}
              </button>
            </div>
          </div>
        )}
      </section>

      <h2 className="mb-1 font-display text-xl font-semibold">{t("broadcastLog")}</h2>
      <p className="mb-3 text-xs text-muted">{t("broadcastLogHint")}</p>
      {broadcasts === null ? (
        <p className="text-sm text-muted">{t("broadcastLoading")}</p>
      ) : broadcasts.length === 0 ? (
        <p className="text-sm text-muted">{t("broadcastNone")}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {broadcasts.map((b) => (
            <article key={b.id} className={ui.card + " p-4"}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 dir="auto" className="break-words font-semibold text-ink">
                    {b.title}
                  </h3>
                  <p className="text-xs text-muted">
                    {format.dateTime(new Date(b.created_at), { dateStyle: "medium", timeStyle: "short" })} · {audienceLabel(b)}
                  </p>
                </div>
                <span className={ui.badge(b.status === "sending" ? "secondary" : "success")}>{b.status === "sending" ? t("broadcastStatusSending") : t("broadcastStatusFinished")}</span>
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-center sm:grid-cols-6">
                {(["total", "sent", "opened", "no_device", "failed", "pending"] as const).map((key) => (
                  <div key={key} className="rounded-lg bg-surface-sunken px-1 py-2">
                    <dd className="font-semibold text-ink">{b.totals[key]}</dd>
                    <dt className="text-[11px] text-muted">{t(`broadcastCount_${key}`)}</dt>
                  </div>
                ))}
              </dl>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                <button type="button" className={ui.link} aria-expanded={openLog === b.id} onClick={() => toggleLog(b.id)}>
                  {openLog === b.id ? t("broadcastHideLog") : t("broadcastShowLog")}
                </button>
                {(b.totals.failed > 0 || b.stale) && (
                  <button type="button" className={ui.link} onClick={() => retry(b.id)}>
                    {t("broadcastRetry")}
                  </button>
                )}
              </div>
              {openLog === b.id && (
                <div className="mt-3 max-h-80 overflow-y-auto rounded-xl border border-border">
                  {log === null ? (
                    <p className="p-3 text-sm text-muted">{t("broadcastLoading")}</p>
                  ) : (
                    log.map((r) => (
                      <div key={r.user_id} className="flex items-center justify-between gap-3 border-b border-border px-3 py-2 text-sm last:border-0">
                        <span className="min-w-0 truncate text-ink">{r.name}</span>
                        <span className="flex shrink-0 items-center gap-2">
                          {r.read_at && <span className="text-xs text-muted">{t("broadcastCount_opened")}</span>}
                          <span className={ui.badge(STATUS_TONE[r.push_status] ?? "secondary")}>{t(`broadcastRecipient_${r.push_status}`)}</span>
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
