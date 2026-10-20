"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { HeartIcon } from "@/components/nav-icons";
import {
  NotificationsProvider,
  useHasNotificationsProvider,
  useNotifications,
} from "@/components/notifications/notifications-provider";
import NotificationList, { NotificationActions } from "@/components/notifications/notification-list";

/**
 * The bell with its dropdown. Inside the app frame it shares the frame's
 * NotificationsProvider; elsewhere (the admin panel) it brings its own.
 */
export default function NotificationBell(props: { variant?: "sidebar" | "header" }) {
  const hasProvider = useHasNotificationsProvider();
  if (hasProvider) return <Bell {...props} />;
  return (
    <NotificationsProvider>
      <Bell {...props} />
    </NotificationsProvider>
  );
}

function Bell({ variant = "sidebar" }: { variant?: "sidebar" | "header" }) {
  const t = useTranslations("Notifications");
  const { unread } = useNotifications();
  const [open, setOpen] = useState(false);

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
              <NotificationActions />
            </div>
            <div className="max-h-[22rem] overflow-y-auto">
              <NotificationList onOpen={() => setOpen(false)} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
