"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Avatar } from "@/app/[locale]/feed/feed-shared";
import { MATCHES_API } from "@/lib/matching/match-access";
import { getJson, request } from "@/lib/request";
import { ui } from "@/lib/ui";
import type { PendingRating } from "@/lib/rating-prompts";

const DISMISSED_KEY = "rate-prompt-dismissed";

function dismissed(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function dismiss(matchId: string) {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...dismissed(), matchId].slice(-50)));
  } catch {
    // storage unavailable: it just asks again next time
  }
}

/**
 * "How was it with Rita?" on Home: one tap on a star rates a provider the
 * customer has been talking to for a couple of days (or had an order
 * with), then an optional few words. "Not now" hides it on this phone.
 */
export default function RatePrompt() {
  const t = useTranslations("Rating");
  const locale = useLocale();
  const [items, setItems] = useState<PendingRating[] | null>(null);
  const [score, setScore] = useState(0);
  const [comment, setComment] = useState("");
  const [stage, setStage] = useState<"stars" | "comment" | "thanks">("stars");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    getJson<{ items: PendingRating[] }>(`/api/ratings/pending?locale=${locale}`)
      .then((body) => {
        const hidden = new Set(dismissed());
        setItems((body?.items ?? []).filter((i) => !hidden.has(i.matchId)));
      })
      .catch(() => setItems([]));
  }, [locale]);

  const item = items?.[0];
  if (!item) return null;

  function next() {
    setItems((list) => (list ?? []).slice(1));
    setScore(0);
    setComment("");
    setStage("stars");
    setError(false);
  }

  async function save(n: number, words?: string) {
    setSaving(true);
    setError(false);
    const res = await request(`${MATCHES_API}/${item!.matchId}/rating`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(words ? { score: n, comment: words } : { score: n }),
    });
    setSaving(false);
    if (!res?.ok) {
      setError(true);
      return false;
    }
    return true;
  }

  return (
    <section className={ui.card + " flex flex-col gap-3 p-4"} aria-live="polite">
      <div className="flex items-center gap-3">
        <Avatar photoUrl={item.photoUrl} name={item.name} size={44} />
        <div className="min-w-0 flex-1">
          <p className="font-display font-semibold leading-snug text-ink">
            {stage === "thanks" ? t("promptThanks") : t("promptTitle", { name: item.name })}
          </p>
          <p className="truncate text-xs text-muted">{stage === "thanks" ? t("promptThanksBody") : item.categoryName}</p>
        </div>
      </div>

      {stage === "stars" && (
        <>
          <div className="flex items-center justify-between gap-2" role="group" aria-label={t("promptTitle", { name: item.name })}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                disabled={saving}
                aria-label={t("promptStar", { count: n })}
                onClick={async () => {
                  setScore(n);
                  if (await save(n)) setStage("comment");
                }}
                className={`flex h-12 flex-1 items-center justify-center rounded-xl text-3xl leading-none transition active:scale-95 ${
                  n <= score ? "bg-accent-soft text-accent-hover" : "bg-surface-sunken text-border-strong"
                }`}
              >
                ★
              </button>
            ))}
          </div>
          <p className="text-xs text-muted">{t("promptBody")}</p>
          <button
            type="button"
            onClick={() => {
              dismiss(item.matchId);
              next();
            }}
            className="self-start text-sm font-medium text-muted underline-offset-2 hover:underline"
          >
            {t("promptNotNow")}
          </button>
        </>
      )}

      {stage === "comment" && (
        <form
          className="flex flex-col gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!comment.trim() || (await save(score, comment.trim()))) setStage("thanks");
          }}
        >
          <label className="text-sm text-ink" htmlFor="rate-prompt-comment">
            {t("promptComment", { name: item.name })}
          </label>
          <textarea
            id="rate-prompt-comment"
            dir="auto"
            rows={2}
            maxLength={1000}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={t("commentPlaceholder")}
            className={ui.input}
          />
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className={ui.buttonPrimary}>
              {comment.trim() ? (saving ? t("submitting") : t("promptSend")) : t("promptDone")}
            </button>
          </div>
        </form>
      )}

      {stage === "thanks" && (
        <button type="button" onClick={next} className={ui.buttonSecondary + " self-start"}>
          {t("promptDone")}
        </button>
      )}

      {error && <p className="text-sm text-danger">{t("error")}</p>}
    </section>
  );
}
