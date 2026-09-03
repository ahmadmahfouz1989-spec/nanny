"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ChatIcon } from "@/components/nav-icons";

function useUnreadCount() {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    function load() {
      fetch("/api/messages/inbox")
        .then((res) => res.json())
        .then((body) => {
          const total = (body.conversations ?? []).reduce(
            (sum: number, c: { unreadCount: number }) => sum + c.unreadCount,
            0,
          );
          setUnreadCount(total);
        })
        .catch(() => {});
    }
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  return unreadCount;
}

export function MessagesSidebarItem({ active }: { active: boolean }) {
  const t = useTranslations("Nav");
  const unreadCount = useUnreadCount();

  return (
    <Link
      href="/messages"
      className={`relative flex items-center gap-3 rounded-xl px-3 py-2 text-[15px] transition-colors ${
        active
          ? "bg-surface-sunken font-semibold text-ink"
          : "text-muted hover:bg-surface-sunken hover:text-ink"
      }`}
    >
      <ChatIcon className="h-[22px] w-[22px] shrink-0" />
      <span>{t("messages")}</span>
      {unreadCount > 0 && (
        <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-primary text-white text-[11px] font-semibold">
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}
    </Link>
  );
}

export function MessagesTabItem({ active }: { active: boolean }) {
  const t = useTranslations("Nav");
  const unreadCount = useUnreadCount();

  return (
    <Link
      href="/messages"
      className={`relative flex flex-col items-center gap-0.5 px-3 py-1 text-[11px] transition-colors ${
        active ? "font-semibold text-primary" : "text-muted"
      }`}
    >
      <span className="relative">
        <ChatIcon className="h-[22px] w-[22px]" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -end-1.5 inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-primary text-white text-[10px] font-semibold">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </span>
      {t("messages")}
    </Link>
  );
}
