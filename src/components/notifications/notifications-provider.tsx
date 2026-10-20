"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { announceFeedTarget } from "@/lib/feed-target";
import { announceMatchTarget } from "@/lib/match-target";
import { notificationHref } from "@/lib/notification-content";

export type Notification = {
  id: string;
  type: string;
  payload: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
};

type NotificationsState = {
  items: Notification[] | null;
  unread: number;
  open: (n: Notification) => void;
  markAllRead: () => void;
  clearAll: () => void;
};

const NotificationsContext = createContext<NotificationsState | null>(null);

/**
 * One copy of the latest notifications for the whole app frame, so the
 * sidebar bell, the phone tab bar's badge and the Notifications page all
 * show the same thing and only one of them polls.
 */
export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [items, setItems] = useState<Notification[] | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const res = await fetch("/api/notifications?pageSize=30");
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

  const open = useCallback(
    (n: Notification) => {
      if (!n.read_at) {
        setItems((prev) => prev?.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)) ?? prev);
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
    },
    [router],
  );

  const markAllRead = useCallback(() => {
    setItems((prev) => prev?.map((x) => ({ ...x, read_at: x.read_at ?? new Date().toISOString() })) ?? prev);
    fetch("/api/notifications/read-all", { method: "PATCH" }).catch(() => {});
  }, []);

  const clearAll = useCallback(() => {
    setItems([]);
    fetch("/api/notifications", { method: "DELETE" }).catch(() => {});
  }, []);

  const value = useMemo(
    () => ({ items, unread: (items ?? []).filter((n) => !n.read_at).length, open, markAllRead, clearAll }),
    [items, open, markAllRead, clearAll],
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
  const value = useContext(NotificationsContext);
  if (!value) throw new Error("useNotifications needs a NotificationsProvider");
  return value;
}

export function useHasNotificationsProvider() {
  return useContext(NotificationsContext) !== null;
}
