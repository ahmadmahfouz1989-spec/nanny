"use client";

import { useCallback, useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { ui } from "@/lib/ui";
import AdminPageHeader from "@/components/admin/admin-page-header";
import { getJson, request } from "@/lib/request";
import { FLASH_NEWS_MAX } from "@/lib/flash-news";

type Row = {
  id: string;
  body: string;
  body_ar: string | null;
  created_at: string;
  ended_at: string | null;
  pushed_at: string | null;
  push_sent: number | null;
  push_failed: number | null;
};

/** Flash news: post a line for everyone's banner, push it to phones, take it down. */
export default function AdminFlashNewsPage() {
  const t = useTranslations("Admin");
  const format = useFormatter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [body, setBody] = useState("");
  const [bodyAr, setBodyAr] = useState("");
  const [posting, setPosting] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  // The push goes to everyone: one tap arms it, a second sends.
  const [confirmPush, setConfirmPush] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    getJson<{ news: Row[] }>("/api/admin/flash-news").then((r) => r && setRows(r.news));
  }, []);
  useEffect(() => {
    load();
    // Push totals come in while the sending runs.
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  }, [load]);

  async function post(e: React.FormEvent) {
    e.preventDefault();
    if (body.trim().length < 2) {
      setError(t("flashTooShort"));
      return;
    }
    setPosting(true);
    setError(null);
    const res = await request("/api/admin/flash-news", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: body.trim(), bodyAr: bodyAr.trim() || undefined }),
    });
    setPosting(false);
    if (!res?.ok) {
      setError(t("flashError"));
      return;
    }
    setBody("");
    setBodyAr("");
    load();
  }

  async function act(id: string, action: "end" | "push") {
    setBusy(id);
    setError(null);
    setConfirmPush(null);
    const res = await request(`/api/admin/flash-news/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setBusy(null);
    if (!res?.ok) setError(res?.status === 503 ? t("flashPushOff") : t("flashError"));
    load();
  }

  const live = (rows ?? []).filter((r) => !r.ended_at);
  const past = (rows ?? []).filter((r) => r.ended_at);
  const when = (iso: string) => format.dateTime(new Date(iso), { dateStyle: "medium", timeStyle: "short" });

  const card = (r: Row) => (
    <li key={r.id} className={ui.card + " flex flex-col gap-3 p-4"}>
      <p dir="auto" className="text-ink">{r.body}</p>
      {r.body_ar && <p dir="rtl" className="text-ink/80">{r.body_ar}</p>}
      <p className="text-xs text-muted">
        {t("flashPostedAt", { date: when(r.created_at) })}
        {r.ended_at && ` · ${t("flashEndedAt", { date: when(r.ended_at) })}`}
        {r.pushed_at &&
          ` · ${r.push_sent === null ? t("flashPushSending") : t("flashPushed", { sent: r.push_sent, failed: r.push_failed ?? 0 })}`}
      </p>
      {!r.ended_at && (
        <div className="flex flex-wrap gap-2">
          {!r.pushed_at &&
            (confirmPush === r.id ? (
              <>
                <button type="button" disabled={busy === r.id} onClick={() => act(r.id, "push")} className={ui.buttonPrimary + " px-4! py-1.5! text-sm"}>
                  {t("flashPushConfirm")}
                </button>
                <button type="button" onClick={() => setConfirmPush(null)} className={ui.buttonSecondary + " px-4! py-1.5! text-sm"}>
                  {t("flashCancel")}
                </button>
              </>
            ) : (
              <button type="button" disabled={busy === r.id} onClick={() => setConfirmPush(r.id)} className={ui.buttonSecondary + " px-4! py-1.5! text-sm"}>
                🔔 {t("flashPush")}
              </button>
            ))}
          <button type="button" disabled={busy === r.id} onClick={() => act(r.id, "end")} className="rounded-full px-4 py-1.5 text-sm font-medium text-danger hover:bg-danger/10 disabled:opacity-50">
            {t("flashRemove")}
          </button>
        </div>
      )}
    </li>
  );

  return (
    <>
      <AdminPageHeader title={t("flashTitle")} description={t("flashDescription")} />

      <form onSubmit={post} className={ui.card + " mb-8 flex flex-col gap-3 p-5"}>
        <label className="flex flex-col gap-1.5">
          <span className={ui.label}>{t("flashBody")}</span>
          <textarea dir="auto" rows={2} maxLength={FLASH_NEWS_MAX} className={ui.input} value={body} onChange={(e) => setBody(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={ui.label}>{t("flashBodyAr")}</span>
          <textarea dir="rtl" rows={2} maxLength={FLASH_NEWS_MAX} className={ui.input} value={bodyAr} onChange={(e) => setBodyAr(e.target.value)} />
          <span className="text-xs text-muted">{t("flashBodyArHint")}</span>
        </label>
        {error && <p className="text-sm text-danger">{error}</p>}
        <button type="submit" disabled={posting} className={ui.buttonPrimary + " self-start"}>
          {posting ? t("flashPosting") : t("flashPost")}
        </button>
      </form>

      <h2 className="mb-3 font-display text-lg font-semibold">{t("flashLive")}</h2>
      {rows && live.length === 0 && <p className="mb-8 text-sm text-muted">{t("flashNone")}</p>}
      <ul className="mb-8 flex flex-col gap-3">{live.map(card)}</ul>

      {past.length > 0 && (
        <>
          <h2 className="mb-3 font-display text-lg font-semibold">{t("flashPast")}</h2>
          <ul className="flex flex-col gap-3 opacity-80">{past.map(card)}</ul>
        </>
      )}
    </>
  );
}
