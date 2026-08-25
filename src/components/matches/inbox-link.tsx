"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export default function InboxLink({ className = "" }: { className?: string }) {
  const t = useTranslations("Inbox");
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

  return (
    <Link href="/messages" className={`relative inline-flex items-center gap-1.5 text-sm ${className}`}>
      {t("navLabel")}
      {unreadCount > 0 && (
        <span className="inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-primary text-white text-[10px] font-semibold">
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}
    </Link>
  );
}
