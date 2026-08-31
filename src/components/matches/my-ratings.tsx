"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import RatingStars from "@/components/matches/rating-stars";
import { useHashScroll } from "@/components/matches/use-hash-scroll";
import { ui } from "@/lib/ui";

type Review = { score: number; comment: string | null; createdAt: string };
type Response = { average: number | null; count: number; reviews: Review[] };

function Stars({ score }: { score: number }) {
  return (
    <span aria-hidden className="text-accent-hover text-sm tracking-tight">
      {"★★★★★".slice(0, score)}
      <span className="text-border">{"★★★★★".slice(score)}</span>
    </span>
  );
}

/**
 * "Ratings you've received" card on the profile page. Notification links
 * for `rating_received` point at /profile#ratings.
 */
export default function MyRatings() {
  const t = useTranslations("Rating");
  const locale = useLocale();
  const [data, setData] = useState<Response | null>(null);
  useHashScroll(!!data);

  useEffect(() => {
    let active = true;
    fetch("/api/ratings/received")
      .then((res) => (res.ok ? res.json() : null))
      .then((body: Response | null) => {
        if (active && body) setData(body);
      });
    return () => {
      active = false;
    };
  }, []);

  const monthYear = (iso: string) =>
    new Intl.DateTimeFormat(locale, { month: "short", year: "numeric" }).format(new Date(iso));

  return (
    <div id="ratings" className={ui.card + " p-6 mb-5 scroll-mt-6 transition-shadow"}>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">{t("myRatingsTitle")}</p>
        {data && data.count > 0 && <RatingStars average={data.average} count={data.count} size="xs" />}
      </div>

      {!data && <p className="text-sm text-muted">{t("reviewsLoading")}</p>}
      {data && data.count === 0 && <p className="text-sm text-muted">{t("myRatingsEmpty")}</p>}

      {data && data.count > 0 && (
        <div className="flex flex-col divide-y divide-border">
          {data.reviews.map((r, i) => (
            <div key={i} className="flex flex-col gap-0.5 py-3 first:pt-0 last:pb-0">
              <div className="flex items-center justify-between gap-2">
                <Stars score={r.score} />
                <span className="text-[11px] text-muted shrink-0">{monthYear(r.createdAt)}</span>
              </div>
              {r.comment && <p className="text-sm text-ink/80">{r.comment}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
