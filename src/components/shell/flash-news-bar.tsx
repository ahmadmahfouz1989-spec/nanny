"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { FlashNews } from "@/lib/flash-news";

const CHECK_EVERY_MS = 2 * 60_000;
const HIDDEN_KEY = "flash-news-hidden";

function readHidden(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Flash news from ouiKnow, scrolling across the top of the app like a news
 * ticker, until an admin takes it down (/admin/flash-news). The × hides
 * what's up now on this phone; a new one shows again.
 */
export default function FlashNewsBar() {
  const t = useTranslations("FlashNews");
  const locale = useLocale();
  const [news, setNews] = useState<FlashNews[]>([]);
  const [hidden, setHidden] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    // What this phone hid lives on the phone, read after the page arrives.
    void Promise.resolve().then(() => alive && setHidden(readHidden()));
    const load = () =>
      fetch("/api/flash-news")
        .then((r) => (r.ok ? r.json() : null))
        .then((body) => alive && body && setNews(body.news ?? []))
        .catch(() => {});
    void load();
    const id = setInterval(load, CHECK_EVERY_MS);
    const onVisible = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const shown = news.filter((n) => !hidden.includes(n.id));
  if (shown.length === 0) return null;

  const text = shown.map((n) => (locale === "ar" && n.bodyAr ? n.bodyAr : n.body)).join("   •   ");
  // About the same reading speed for a short line or a long one.
  const seconds = Math.max(12, Math.round(text.length * 0.22));

  function hide() {
    const next = [...new Set([...hidden, ...shown.map((n) => n.id)])].slice(-50);
    setHidden(next);
    try {
      localStorage.setItem(HIDDEN_KEY, JSON.stringify(next));
    } catch {}
  }

  return (
    <div role="region" aria-label={t("label")} className="flash-news-bar flex items-stretch border-b border-border bg-surface-sunken text-sm">
      <span className="flex shrink-0 items-center gap-1.5 bg-danger px-3 py-2 text-xs font-bold uppercase tracking-wide text-white">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" aria-hidden />
        {t("label")}
      </span>
      <div className="flash-news-track relative min-w-0 flex-1 overflow-hidden py-2">
        <p className="flash-news-text whitespace-nowrap font-medium text-ink" style={{ animationDuration: `${seconds}s` }}>
          {text}
        </p>
      </div>
      <button type="button" onClick={hide} aria-label={t("hide")} className="shrink-0 px-3 text-lg leading-none text-muted hover:text-ink">
        ×
      </button>
    </div>
  );
}
