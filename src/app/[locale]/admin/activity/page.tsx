"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ui } from "@/lib/ui";
import AdminPageHeader from "@/components/admin/admin-page-header";
import { RowListSkeleton } from "@/components/skeletons";
import { getJson } from "@/lib/request";

type Conversation = {
  matchId: string;
  category: { slug: string; nameEn: string; nameAr: string };
  seeker: { profileId: string; name: string };
  provider: { profileId: string; name: string };
  startedBy: "seeker" | "provider" | null;
  messages: number;
  fromSeeker: number;
  fromProvider: number;
  startedAt: string | null;
  lastMessageAt: string;
  blocked: boolean;
};

type Stats = { conversations: number; twoWay: number; startedThisWeek: number; messagesThisWeek: number };

type Page = { conversations: Conversation[]; hasMore: boolean; total: number; stats: Stats | null };

function relativeTime(iso: string, locale: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (minutes < 60) return rtf.format(-minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours < 24) return rtf.format(-hours, "hour");
  return rtf.format(-Math.round(hours / 24), "day");
}

/**
 * Who is talking to whom across the marketplace, and how much -- message
 * counts per side, never message contents (those only surface through a
 * report).
 */
export default function AdminActivityPage() {
  const t = useTranslations("Admin");
  const locale = useLocale();
  const [categories, setCategories] = useState<{ slug: string; nameEn: string; nameAr: string }[]>([]);
  const [category, setCategory] = useState("");
  const [active, setActive] = useState("");
  const [rows, setRows] = useState<Conversation[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failed, setFailed] = useState(false);
  // Only the latest filter's response may land (an older, slower one must
  // not overwrite it).
  const requestIdRef = useRef(0);

  useEffect(() => {
    getJson("/api/admin/analytics").then((body) => body && setCategories(body.categories ?? []));
  }, []);

  function params(p: number) {
    const q = new URLSearchParams({ page: String(p) });
    if (category) q.set("category", category);
    if (active) q.set("active", active);
    return q;
  }

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    getJson<Page>(`/api/admin/conversations?${params(1)}`).then((body) => {
      if (requestId !== requestIdRef.current) return;
      if (!body) {
        setFailed(true);
        return;
      }
      setFailed(false);
      setRows(body.conversations);
      setHasMore(body.hasMore);
      setTotal(body.total);
      setPage(1);
      if (body.stats) setStats(body.stats);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, active]);

  function changeFilter(set: (v: string) => void, value: string) {
    setRows(null);
    set(value);
  }

  function loadMore() {
    setLoadingMore(true);
    const requestId = requestIdRef.current;
    getJson<Page>(`/api/admin/conversations?${params(page + 1)}`)
      .then((body) => {
        if (!body || requestId !== requestIdRef.current) return;
        setRows((prev) => [...(prev ?? []), ...body.conversations]);
        setHasMore(body.hasMore);
        setPage((p) => p + 1);
      })
      .finally(() => setLoadingMore(false));
  }

  const tiles = [
    { label: t("activityStatConversations"), value: stats?.conversations },
    { label: t("activityStatTwoWay"), value: stats?.twoWay, hint: t("activityStatTwoWayHint") },
    { label: t("activityStatNewThisWeek"), value: stats?.startedThisWeek },
    { label: t("activityStatMessagesThisWeek"), value: stats?.messagesThisWeek },
  ];

  const name = (c: { nameEn: string; nameAr: string }) => (locale === "ar" ? c.nameAr : c.nameEn);

  return (
    <>
      <AdminPageHeader title={t("activityTitle")} description={t("activityDescription")} />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className={ui.card + " p-5"}>
            <p className="text-2xl font-display font-semibold">{tile.value ?? "—"}</p>
            <p className="text-xs text-muted mt-1">{tile.label}</p>
            {tile.hint && <p className="mt-0.5 text-[11px] text-muted/80">{tile.hint}</p>}
          </div>
        ))}
      </div>

      <div className="mt-8 mb-4 flex flex-col gap-3 sm:flex-row">
        <select className={ui.select} value={category} onChange={(e) => changeFilter(setCategory, e.target.value)}>
          <option value="">{t("allCategories")}</option>
          {categories.map((c) => (
            <option key={c.slug} value={c.slug}>
              {name(c)}
            </option>
          ))}
        </select>
        <select className={ui.select} value={active} onChange={(e) => changeFilter(setActive, e.target.value)}>
          <option value="">{t("activityActiveAny")}</option>
          <option value="7d">{t("activityActive7d")}</option>
          <option value="30d">{t("activityActive30d")}</option>
        </select>
      </div>

      {rows && <p className="mb-3 text-xs text-muted">{t("activityCount", { count: total })}</p>}
      {!rows && failed && <p className="text-sm text-muted">{t("loadError")}</p>}
      {!rows && !failed && <RowListSkeleton count={5} label={t("activityTitle")} />}
      {rows && rows.length === 0 && <p className="text-sm text-muted">{t("activityEmpty")}</p>}

      <div className="flex flex-col gap-2">
        {rows?.map((c) => {
          const oneWay = c.fromSeeker === 0 || c.fromProvider === 0;
          const starter = c.startedBy === "seeker" ? c.seeker.name : c.startedBy === "provider" ? c.provider.name : null;
          return (
            <div key={c.matchId} className={ui.card + " flex flex-col gap-2 p-4"}>
              <div className="flex flex-wrap items-center gap-2">
                <p className="min-w-0 font-medium">
                  <span dir="auto">{c.seeker.name}</span>
                  <span className="text-xs text-muted"> ({t("activitySeeker")})</span>
                  <span className="mx-1.5 text-muted">↔</span>
                  <span dir="auto">{c.provider.name}</span>
                  <span className="text-xs text-muted"> ({t("activityProvider")})</span>
                </p>
                <span className={ui.badge("secondary")}>{name(c.category)}</span>
                {c.blocked && <span className={ui.badge("danger")}>{t("activityBlocked")}</span>}
                {!c.blocked && oneWay && <span className={ui.badge("warning")}>{t("activityAwaitingReply")}</span>}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                <span>
                  <span className="font-semibold text-ink">{t("activityMessages", { count: c.messages })}</span>
                  {" · "}
                  <span dir="auto">{c.seeker.name}</span> {c.fromSeeker} · <span dir="auto">{c.provider.name}</span> {c.fromProvider}
                </span>
                {starter && (
                  <span>
                    {t("activityStartedBy")} <span dir="auto">{starter}</span>
                  </span>
                )}
                <span>
                  {t("activityLastMessage")} {relativeTime(c.lastMessageAt, locale)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {hasMore && (
        <button type="button" onClick={loadMore} disabled={loadingMore} className={ui.buttonSecondary + " mt-4 self-center"}>
          {loadingMore ? t("activityLoadingMore") : t("activityLoadMore")}
        </button>
      )}
    </>
  );
}
