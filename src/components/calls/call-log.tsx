"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { canOptimize } from "@/lib/image-src";
import { getJson, request } from "@/lib/request";
import { announceUnreadChanged } from "@/lib/unread-events";
import { callOutcome, formatCallLength, type CallEntry } from "@/lib/call-history";
import AvatarIllustration from "@/components/illustrations/avatar-illustration";
import CallButton from "@/components/calls/call-button";
import { PhoneIcon } from "@/components/calls/phone-icon";
import { RowListSkeleton } from "@/components/skeletons";

export type CallLogItem = CallEntry & {
  categorySlug: string;
  counterpart: { id: string; name: string; photoUrl: string | null };
  unseen: boolean;
};

const REFRESH_MS = 15_000;

/** "3:42 PM" today, "Yesterday", a weekday this week, else the date. */
function callTime(iso: string, locale: string) {
  const date = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = 86_400_000;
  if (date.getTime() >= startOfToday) return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(date);
  if (date.getTime() >= startOfToday - day) {
    const text = new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(-1, "day");
    return text.charAt(0).toUpperCase() + text.slice(1);
  }
  if (date.getTime() >= startOfToday - 6 * day) return new Intl.DateTimeFormat(locale, { weekday: "long" }).format(date);
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(date);
}

/** The arrow by a call: out to them, or in from them (red when missed). */
export function CallArrow({ outgoing, className = "" }: { outgoing: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={`h-3.5 w-3.5 shrink-0 rtl:scale-x-[-1] ${className}`} fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
      {outgoing ? (
        <path d="M5 11l6-6M6 5h5v5" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="M11 5l-6 6M10 11H5V6" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}

/**
 * The Calls tab of Messages: every call in and out, newest first, with how
 * it went and a button to call back. Opening it counts the missed ones as
 * seen (the badge clears).
 */
export default function CallLog({ onOpenChat }: { onOpenChat: (matchId: string) => void }) {
  const t = useTranslations("Calls");
  const tNav = useTranslations("Nav");
  const locale = useLocale();
  const [filter, setFilter] = useState<"all" | "missed">("all");
  const [calls, setCalls] = useState<CallLogItem[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    getJson<{ calls?: CallLogItem[] }>(`/api/calls/history${filter === "missed" ? "?filter=missed" : ""}`).then((body) => {
      if (!body) {
        setFailed(true);
        return;
      }
      setFailed(false);
      setCalls(body.calls ?? []);
      if (body.calls?.some((c) => c.unseen)) {
        void request("/api/calls/seen", { method: "POST" }).then(() => announceUnreadChanged());
      }
    });
  }, [filter]);

  useEffect(() => {
    load();
    const id = setInterval(() => document.visibilityState === "visible" && load(), REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const chip = (value: "all" | "missed", label: string) => (
    <button
      type="button"
      onClick={() => {
        if (value === filter) return;
        setCalls(null);
        setFilter(value);
      }}
      aria-pressed={filter === value}
      className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
        filter === value ? "bg-ink text-surface" : "bg-surface-sunken text-ink/80 hover:bg-surface-sunken/70"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col">
      <div className="flex gap-2 px-4 py-3">
        {chip("all", t("filterAll"))}
        {chip("missed", t("filterMissed"))}
      </div>
      {!calls && failed && <p className="p-4 text-sm text-muted">{t("loadError")}</p>}
      {!calls && !failed && <RowListSkeleton label={t("loading")} />}
      {calls && calls.length === 0 && (
        <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-sunken text-muted">
            <PhoneIcon className="h-7 w-7" />
          </span>
          {filter === "missed" ? (
            <p className="text-sm text-muted">{t("emptyMissed")}</p>
          ) : (
            <>
              <p className="font-display font-semibold">{t("emptyTitle")}</p>
              <p className="max-w-xs text-sm text-muted">{t("emptyBody")}</p>
            </>
          )}
        </div>
      )}
      {calls?.map((c) => {
        const outcome = callOutcome(c);
        const missed = outcome === "missed";
        const label =
          outcome === "talked" ? `${t(c.outgoing ? "log.outgoing" : "log.incoming")} · ${formatCallLength(c.seconds ?? 0)}` : t(`log.${outcome}`);
        const name = c.counterpart.name || t("someone");
        return (
          <div key={c.id} className="flex items-center gap-3 border-b border-border ps-4 pe-2">
            <button type="button" onClick={() => onOpenChat(c.matchId)} className="flex min-w-0 flex-1 items-center gap-3 py-3 text-start">
              {c.counterpart.photoUrl ? (
                <Image
                  src={c.counterpart.photoUrl}
                  alt=""
                  width={48}
                  height={48}
                  unoptimized={!canOptimize(c.counterpart.photoUrl)}
                  className="h-12 w-12 shrink-0 rounded-full object-cover"
                />
              ) : (
                <AvatarIllustration name={name} className="h-12 w-12 shrink-0 rounded-full" />
              )}
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-center gap-1.5">
                  <span dir="auto" className={`truncate font-display font-semibold ${missed ? "text-danger" : ""}`}>
                    {name}
                  </span>
                  {c.categorySlug && (
                    <span className="shrink-0 rounded-full bg-surface-sunken px-1.5 py-0.5 text-[10px] font-medium text-muted">
                      {tNav.has(c.categorySlug) ? tNav(c.categorySlug) : c.categorySlug}
                    </span>
                  )}
                </span>
                <span className={`flex items-center gap-1 text-sm ${missed ? "text-danger" : "text-muted"}`}>
                  <CallArrow outgoing={c.outgoing} />
                  <span className="truncate">{label}</span>
                </span>
              </span>
              <span className="shrink-0 text-xs text-muted">{callTime(c.createdAt, locale)}</span>
            </button>
            <CallButton matchId={c.matchId} name={name} photoUrl={c.counterpart.photoUrl} />
          </div>
        );
      })}
    </div>
  );
}
