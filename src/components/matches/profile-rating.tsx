"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import RatingStars from "./rating-stars";
import ReviewsPanel from "./reviews-panel";

/**
 * Star summary on a profile card. Shows the average + count while scrolling;
 * clicking expands the full list of reviews. Renders nothing until the
 * profile has been rated.
 */
export default function ProfileRating({
  profileId,
  average,
  count,
}: {
  profileId: string;
  average: number | null;
  count: number;
}) {
  const t = useTranslations("Rating");
  const [open, setOpen] = useState(false);

  // "No ratings yet" on every card of a new marketplace is just noise --
  // the summary appears once there's a first rating.
  if (count === 0) return null;

  return (
    <div>
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
      {open && <ReviewsPanel profileId={profileId} />}
    </div>
  );
}
