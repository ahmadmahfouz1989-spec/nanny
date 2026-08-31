"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ui } from "@/lib/ui";

type RatingResponse = {
  mine: { score: number; comment: string | null; updated_at: string } | null;
  counterpart: { average: number | null; count: number };
  canRate: boolean;
};

function Stars({
  value,
  onSelect,
}: {
  value: number;
  onSelect?: (n: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!onSelect}
          onClick={() => onSelect?.(n)}
          aria-label={`${n}`}
          className={`text-2xl leading-none transition-colors ${
            n <= value ? "text-accent-hover" : "text-border"
          } ${onSelect ? "hover:text-accent-hover cursor-pointer" : "cursor-default"}`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

/**
 * Rate-your-match widget. Lives in the conversation menu and the mutual
 * match card; both pass the match id. Loads any existing rating so it can
 * be edited rather than duplicated.
 */
export default function RatingButton({
  matchId,
  counterpartName,
}: {
  matchId: string;
  counterpartName?: string;
}) {
  const t = useTranslations("Rating");
  const [data, setData] = useState<RatingResponse | null>(null);
  const [open, setOpen] = useState(false);
  const [score, setScore] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/matches/${matchId}/rating`)
      .then((res) => (res.ok ? res.json() : null))
      .then((body: RatingResponse | null) => {
        if (!active || !body) return;
        setData(body);
        if (body.mine) {
          setScore(body.mine.score);
          setComment(body.mine.comment ?? "");
        }
      });
    return () => {
      active = false;
    };
  }, [matchId]);

  async function submit() {
    if (score < 1) return;
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/matches/${matchId}/rating`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ score, comment: comment.trim() || undefined }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(typeof body.error === "string" ? body.error : t("error"));
      return;
    }
    const body = await res.json();
    setData((d) => (d ? { ...d, mine: body.mine, counterpart: body.counterpart } : d));
    setOpen(false);
  }

  if (data && !data.canRate) {
    return <p className="mt-3 text-xs text-muted">{t("notYet")}</p>;
  }

  if (!open) {
    return (
      <div className="mt-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-xs font-semibold text-ink/80 transition hover:border-primary/40 hover:bg-primary-soft/40 hover:text-ink"
        >
          <span aria-hidden className="text-base leading-none text-accent-hover">
            {data?.mine ? "★" : "☆"}
          </span>
          {data?.mine ? t("editRating", { score: data.mine.score }) : t("action")}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-border p-3 flex flex-col gap-2">
      <label className={ui.label + " text-xs"}>
        {counterpartName ? t("titleNamed", { name: counterpartName }) : t("title")}
      </label>
      <Stars value={score} onSelect={setScore} />
      <textarea
        className={ui.input}
        rows={2}
        placeholder={t("commentPlaceholder")}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        maxLength={1000}
      />
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={submitting || score < 1}
          className={ui.buttonPrimary + " px-4! py-1.5! text-xs"}
        >
          {submitting ? t("submitting") : data?.mine ? t("update") : t("submit")}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={ui.buttonGhost + " text-xs"}>
          {t("cancel")}
        </button>
      </div>
    </div>
  );
}
