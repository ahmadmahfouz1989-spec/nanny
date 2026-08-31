"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { HeartIcon } from "@/components/nav-icons";

type Notification = {
  id: string;
  type: string;
  payload: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
};

const KNOWN_TYPES = new Set([
  "interest_accepted",
  "interest_received",
  "rating_received",
  "new_match",
  "profile_approved",
  "profile_rejected",
  "profile_pending_review",
  "verification_updated",
  "report_resolved",
]);

// The app has no per-match detail route — match cards live on the
// dashboard, so match notifications deep-link to the specific card
// (#match-<id>); a rating you received opens the ratings section of your
// profile.
function hrefFor(n: Notification): string {
  const matchId = typeof n.payload?.match_id === "string" ? n.payload.match_id : null;
  switch (n.type) {
    case "interest_accepted":
    case "interest_received":
    case "new_match":
      return matchId ? `/dashboard#match-${matchId}` : "/dashboard";
    case "rating_received":
      return "/profile#ratings";
    case "profile_pending_review":
      return "/admin/profiles";
    case "verification_updated":
      return "/profile";
    default:
      return "/dashboard";
  }
}

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
        const res = await fetch("/api/notifications");
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
    if (n.type === "rating_received") {
      const score = typeof n.payload?.score === "number" ? (n.payload.score as number) : null;
      return score ? t("rating_received", { score }) : t("rating_received_generic");
    }
    return KNOWN_TYPES.has(n.type) ? t(n.type) : t("generic");
  }

  function openRow(n: Notification) {
    setOpen(false);
    if (!n.read_at) {
      setItems((prev) =>
        prev?.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)) ?? prev,
      );
      fetch(`/api/notifications/${n.id}/read`, { method: "PATCH" }).catch(() => {});
    }
    router.push(hrefFor(n));
  }

  function markAllRead() {
    setItems((prev) => prev?.map((x) => ({ ...x, read_at: x.read_at ?? new Date().toISOString() })) ?? prev);
    fetch("/api/notifications/read-all", { method: "PATCH" }).catch(() => {});
  }

  const trigger =
    variant === "header" ? (
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t("title")}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-full text-ink/70 transition hover:bg-surface hover:text-ink"
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
        className={`relative flex w-full items-center gap-3 rounded-full px-3 py-2.5 text-[15px] transition-colors ${
          open ? "font-bold text-ink" : "text-ink/80 hover:bg-surface"
        }`}
      >
        <HeartIcon className="h-6 w-6 shrink-0" />
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
            className={`absolute z-50 w-[20rem] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl border border-border bg-surface shadow-lg ${
              variant === "header"
                ? "end-0 top-full mt-2"
                : "start-0 top-full mt-1 sm:start-full sm:top-0 sm:ms-2"
            }`}
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <p className="font-display text-sm font-bold">{t("title")}</p>
              {unread > 0 && (
                <button type="button" onClick={markAllRead} className="text-xs text-primary hover:underline">
                  {t("markAllRead")}
                </button>
              )}
            </div>
            <div className="max-h-[22rem] overflow-y-auto">
              {!items && <p className="px-4 py-6 text-center text-sm text-muted">{t("loading")}</p>}
              {items && items.length === 0 && (
                <p className="px-4 py-6 text-center text-sm text-muted">{t("empty")}</p>
              )}
              {items?.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => openRow(n)}
                  className={`flex w-full flex-col gap-0.5 border-b border-border px-4 py-3 text-start transition-colors last:border-0 hover:bg-background ${
                    n.read_at ? "" : "bg-primary-soft/30"
                  }`}
                >
                  <span className="text-sm text-ink">{label(n)}</span>
                  <span className="text-[11px] text-muted">
                    {formatRelative(n.created_at, locale, t("justNow"))}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
