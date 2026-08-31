"use client";

import { useTranslations } from "next-intl";

/**
 * Read-only aggregate rating shown on match cards: "★ 4.7 (12)".
 * Renders a muted "no ratings yet" line when there's nothing to show.
 */
export default function RatingStars({
  average,
  count,
  size = "sm",
}: {
  average: number | null;
  count: number;
  size?: "sm" | "xs";
}) {
  const t = useTranslations("Rating");
  const text = size === "xs" ? "text-xs" : "text-sm";

  if (!count || average == null) {
    return <span className={`${text} text-muted`}>{t("none")}</span>;
  }

  const rounded = Math.round(average);

  return (
    <span className={`inline-flex items-center gap-1.5 ${text} font-semibold text-ink`}>
      <span aria-hidden className="text-accent-hover tracking-tight">
        {"★★★★★".slice(0, rounded)}
        <span className="text-border">{"★★★★★".slice(rounded)}</span>
      </span>
      {average.toFixed(1)}
      <span className="text-muted font-normal">({count})</span>
    </span>
  );
}
