"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { HeartIcon } from "@/components/nav-icons";
import { announceFeedTarget } from "@/lib/feed-target";
import { announceMatchTarget } from "@/lib/match-target";
import { notificationHref, notificationLabel } from "@/lib/notification-content";
import { RowListSkeleton } from "@/components/skeletons";

type Notification = {
  id: string;
  type: string;
  payload: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
};

function formatRelative(iso: string, locale: string, justNow: string) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return justNow;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (min < 60) return rtf.format(-min, "minute");
  const hr = Math.round(min / 60);
  if (hr < 24) return rtf.format(-hr, "hour");
  return rtf.format(-Math.round(hr / 24), "day");
}

export default function NotificationBell({
  variant = "sidebar",
}: {
  variant?: "sidebar" | "header";
}) {
  const t = useTranslations("Notifications");
  const locale = useLocale();
  const router = useRouter();
  const [items, setItems] = useState<Notification[] | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const res = await fetch("/api/notifications?pageSize=10");
        if (!res.ok || !active) return;
        const body = await res.json();
        setItems(body.notifications ?? []);
      } catch {
        // keep whatever we had
      }
    }
    load();
    const id = setInterval(load, 30000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  const unread = (items ?? []).filter((n) => !n.read_at).length;

  function label(n: Notification) {
    return notificationLabel(n, t);
  }

  function openRow(n: Notification) {
    setOpen(false);
    if (!n.read_at) {
      setItems((prev) =>
        prev?.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)) ?? prev,
      );
      fetch(`/api/notifications/${n.id}/read`, { method: "PATCH" }).catch(() => {});
    }
    router.push(notificationHref(n));
    const matchTarget = n.payload?.generic_match_id;
    if (
      (n.type === "interest_received" || n.type === "interest_accepted" || n.type === "new_match") &&
      typeof matchTarget === "string"
    ) {
      announceMatchTarget({ matchId: matchTarget });
    }
    if ((n.type === "post_reply" || n.type === "post_like") && typeof n.payload?.post_id === "string") {
      announceFeedTarget({
        postId: n.payload.post_id,
        replyId: typeof n.payload?.reply_id === "string" ? n.payload.reply_id : null,
      });
    }
  }

  function markAllRead() {
    setItems((prev) => prev?.map((x) => ({ ...x, read_at: x.read_at ?? new Date().toISOString() })) ?? prev);
    fetch("/api/notifications/read-all", { method: "PATCH" }).catch(() => {});
  }

  function clearAll() {
    setItems([]);
    fetch("/api/notifications", { method: "DELETE" }).catch(() => {});
  }

  const trigger =
    variant === "header" ? (
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t("title")}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-full text-muted transition hover:bg-surface-sunken hover:text-ink"
      >
        <HeartIcon className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute top-1 end-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
    ) : (
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`relative flex w-full items-center gap-3 rounded-xl px-3 py-2 text-[15px] transition-colors ${
          open
            ? "bg-surface-sunken font-semibold text-ink"
            : "text-muted hover:bg-surface-sunken hover:text-ink"
        }`}
      >
        <HeartIcon className="h-[22px] w-[22px] shrink-0" />
        <span>{t("title")}</span>
        {unread > 0 && (
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
    );

  return (
    <div className="relative">
      {trigger}
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className={`z-50 overflow-hidden rounded-2xl border border-border bg-surface shadow-lg ${
              variant === "header"
                ? "fixed inset-x-3 top-[calc(4rem+env(safe-area-inset-top))]"
                : "absolute start-0 top-full mt-1 w-[20rem] max-w-[calc(100vw-1.5rem)] sm:start-full sm:top-0 sm:ms-2"
            }`}
          >
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
              <p className="font-display text-sm font-bold">{t("title")}</p>
              <div className="flex items-center gap-3">
                {unread > 0 && (
                  <button type="button" onClick={markAllRead} className="text-xs text-primary hover:underline">
                    {t("markAllRead")}
                  </button>
                )}
                {items && items.length > 0 && (
                  <button type="button" onClick={clearAll} className="text-xs text-muted hover:text-danger">
                    {t("clearAll")}
                  </button>
                )}
              </div>
            </div>
            <div className="max-h-[22rem] overflow-y-auto">
              {!items && <RowListSkeleton count={3} label={t("loading")} />}
              {items && items.length === 0 && (
                <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-sunken text-muted">
                    <HeartIcon className="h-4 w-4" />
                  </span>
                  <p className="text-sm text-muted">{t("empty")}</p>
                </div>
              )}
              {items?.map((n) => {
                const notes = typeof n.payload?.notes === "string" && n.payload.notes.trim() ? n.payload.notes : null;
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => openRow(n)}
                    className={`flex w-full flex-col gap-0.5 border-b border-border px-4 py-3 text-start transition-colors last:border-0 hover:bg-background ${
                      n.read_at ? "" : "bg-primary-soft/30"
                    }`}
                  >
                    <span className="text-sm text-ink">{label(n)}</span>
                    {notes && <span className="text-xs text-muted line-clamp-2">{notes}</span>}
                    <span className="text-[11px] text-muted">
                      {formatRelative(n.created_at, locale, t("justNow"))}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
