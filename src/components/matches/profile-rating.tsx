"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import RatingStars from "./rating-stars";
import ReviewsPanel from "./reviews-panel";

/**
 * Star summary on a profile card. Shows the average + count while scrolling;
 * clicking expands the full list of reviews.
 */
export default function ProfileRating({
  profileId,
  profileType,
  average,
  count,
}: {
  profileId: string;
  profileType: "parent" | "nanny";
  average: number | null;
  count: number;
}) {
  const t = useTranslations("Rating");
  const [open, setOpen] = useState(false);

  return (
    <div>
      {count > 0 ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="inline-flex items-center gap-2 hover:opacity-80 transition"
        >
          <RatingStars average={average} count={count} size="xs" />
          <span className="text-xs text-primary underline decoration-primary/30 underline-offset-4">
            {open ? t("hideReviews") : t("seeReviews")}
          </span>
        </button>
      ) : (
        <RatingStars average={average} count={count} size="xs" />
      )}
      {open && <ReviewsPanel profileId={profileId} profileType={profileType} />}
    </div>
  );
}
