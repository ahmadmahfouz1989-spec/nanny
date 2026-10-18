"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import type { ProfileReview } from "@/lib/ratings";

type ReviewsResponse = {
  average: number | null;
  count: number;
  reviews: ProfileReview[];
};

function Stars({ score }: { score: number }) {
  return (
    <span aria-hidden className="text-accent-hover text-sm tracking-tight">
      {"★★★★★".slice(0, score)}
      <span className="text-border">{"★★★★★".slice(score)}</span>
    </span>
  );
}

/**
 * The expanded "all reviews in detail" list for a profile. Fetched lazily
 * when the reader opens it from the star summary on a match card.
 */
export default function ReviewsPanel({
  profileId,
}: {
  profileId: string;
}) {
  const t = useTranslations("Rating");
  const [data, setData] = useState<ReviewsResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`/api/reviews?profileId=${profileId}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("failed"))))
      .then((body: ReviewsResponse) => {
        if (active) setData(body);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [profileId]);

  if (failed) {
    return <p className="mt-2 text-xs text-danger">{t("reviewsError")}</p>;
  }

  if (!data) {
    return <p className="mt-2 text-xs text-muted">{t("reviewsLoading")}</p>;
  }

  return (
    <div className="mt-2 rounded-xl border border-border bg-background p-3">
      <ReviewList reviews={data.reviews} />
    </div>
  );
}

/** Individual reviews, newest first -- the expandable panel and the profile page both use it. */
export function ReviewList({ reviews }: { reviews: ProfileReview[] }) {
  const t = useTranslations("Rating");
  const locale = useLocale();

  const monthYear = (iso: string) =>
    new Intl.DateTimeFormat(locale, { month: "short", year: "numeric" }).format(new Date(iso));

  // Ratings are per-account, not per-category -- one profile's reviews can
  // come from nanny-track and nursing/tutoring matches alike, so each is
  // labelled from its own match rather than from the profile being viewed.
  function raterLabel(rater: ProfileReview["rater"]) {
    if (!rater) return null;
    const category = locale === "ar" ? rater.categoryAr : rater.categoryEn;
    return rater.role === "seeker" ? t("raterGenericSeeker", { category }) : t("raterGenericProvider", { category });
  }

  return (
    <div className="flex flex-col divide-y divide-border">
      {reviews.length === 0 && <p className="text-xs text-muted">{t("reviewsEmpty")}</p>}
      {reviews.map((r, i) => (
        <div key={i} className="flex flex-col gap-0.5 py-3 first:pt-0 last:pb-0">
          <div className="flex items-center justify-between gap-2">
            <Stars score={r.score} />
            <span className="text-[11px] text-muted shrink-0">{monthYear(r.createdAt)}</span>
          </div>
          {r.comment && <p dir="auto" className="text-sm text-ink/80">{r.comment}</p>}
          {raterLabel(r.rater) && <span className="text-[11px] text-muted">{raterLabel(r.rater)}</span>}
        </div>
      ))}
    </div>
  );
}
