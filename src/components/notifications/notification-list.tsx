"use client";

import { useLocale, useTranslations } from "next-intl";
import { HeartIcon } from "@/components/nav-icons";
import { notificationAction, notificationLabel } from "@/lib/notification-content";
import { isCategorySlug } from "@/lib/category-slugs";
import { ChevronIcon } from "@/components/home-icons";
import { RowListSkeleton } from "@/components/skeletons";
import { useNotifications, type Notification } from "./notifications-provider";

function formatRelative(iso: string, locale: string, justNow: string) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return justNow;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (min < 60) return rtf.format(-min, "minute");
  const hr = Math.round(min / 60);
  if (hr < 24) return rtf.format(-hr, "hour");
  return rtf.format(-Math.round(hr / 24), "day");
}

/** "Mark all read" and "Clear all", for whichever header the list sits under. */
export function NotificationActions() {
  const t = useTranslations("Notifications");
  const { items, unread, markAllRead, clearAll } = useNotifications();
  return (
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
  );
}

/** The notification rows, used by the sidebar dropdown and the Notifications page. */
export default function NotificationList({ onOpen }: { onOpen?: (n: Notification) => void }) {
  const t = useTranslations("Notifications");
  const tNav = useTranslations("Nav");
  const categoryName = (slug: string) => (isCategorySlug(slug) ? tNav(slug) : null);
  const locale = useLocale();
  const { items, open } = useNotifications();

  if (!items) return <RowListSkeleton count={3} label={t("loading")} />;

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-sunken text-muted">
          <HeartIcon className="h-4 w-4" />
        </span>
        <p className="text-sm text-muted">{t("empty")}</p>
      </div>
    );
  }

  return (
    <>
      {items.map((n) => {
        const notes = typeof n.payload?.notes === "string" && n.payload.notes.trim() ? n.payload.notes : null;
        const action = notificationAction(n, t);
        return (
          <button
            key={n.id}
            type="button"
            onClick={() => {
              onOpen?.(n);
              open(n);
            }}
            className={`flex w-full items-center gap-3 border-b border-border px-4 py-3 text-start transition-colors last:border-0 hover:bg-background ${
              n.read_at ? "" : "bg-primary-soft/30"
            }`}
          >
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-sm text-ink">{notificationLabel(n, t, categoryName)}</span>
              {notes && <span className="text-xs text-muted line-clamp-2">{notes}</span>}
              <span className="text-[11px] text-muted">
                {formatRelative(n.created_at, locale, t("justNow"))}
                {action && <span className="font-semibold text-primary"> · {action}</span>}
              </span>
            </span>
            <ChevronIcon className="h-4 w-4 shrink-0 text-muted" />
          </button>
        );
      })}
    </>
  );
}
