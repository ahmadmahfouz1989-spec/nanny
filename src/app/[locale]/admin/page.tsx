"use client";

import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { ui } from "@/lib/ui";

type CategoryStats = {
  slug: string;
  nameEn: string;
  nameAr: string;
  status: string;
  providers: number;
  seekers: number;
  pending: number;
  mutualMatches: number;
};

type Analytics = {
  categories: CategoryStats[];
  totalProfiles: number;
  pendingProfiles: number;
  mutualMatches: number;
  openReports: number;
  suspendedUsers: number;
};

export default function AdminOverviewPage() {
  const t = useTranslations("Admin");
  const locale = useLocale();
  const [data, setData] = useState<Analytics | null>(null);

  useEffect(() => {
    fetch("/api/admin/analytics")
      .then((res) => res.json())
      .then(setData);
  }, []);

  const tiles: { label: string; value: number | undefined }[] = [
    { label: t("statTotalProfiles"), value: data?.totalProfiles },
    { label: t("statPending"), value: data?.pendingProfiles },
    { label: t("statMutualMatches"), value: data?.mutualMatches },
    { label: t("statOpenReports"), value: data?.openReports },
    { label: t("statSuspendedUsers"), value: data?.suspendedUsers },
  ];

  return (
    <>
      <h1 className="font-display text-3xl font-semibold mb-8">{t("overviewTitle")}</h1>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        {tiles.map((tile) => (
          <div key={tile.label} className={ui.card + " p-5"}>
            <p className="text-2xl font-display font-semibold">{tile.value ?? "—"}</p>
            <p className="text-xs text-muted mt-1">{tile.label}</p>
          </div>
        ))}
      </div>

      <h2 className="font-display text-xl font-semibold mt-10 mb-4">{t("byCategoryTitle")}</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(data?.categories ?? []).map((category) => (
          <div key={category.slug} className={ui.card + " p-5"}>
            <div className="flex items-center justify-between gap-2 mb-4">
              <p className="font-display text-lg font-semibold">
                {locale === "ar" ? category.nameAr : category.nameEn}
              </p>
              {category.status !== "live" && (
                <span className={ui.badge("warning")}>{t("statusComingSoon")}</span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-2xl font-display font-semibold">{category.providers}</p>
                <p className="text-xs text-muted mt-0.5">{t("statProviders")}</p>
              </div>
              <div>
                <p className="text-2xl font-display font-semibold">{category.seekers}</p>
                <p className="text-xs text-muted mt-0.5">{t("statSeekers")}</p>
              </div>
            </div>
            <div className="mt-4 flex gap-4 border-t border-border pt-3 text-xs text-muted">
              <span>
                {t("statPending")}: <span className="font-semibold text-ink">{category.pending}</span>
              </span>
              <span>
                {t("statMutualMatches")}: <span className="font-semibold text-ink">{category.mutualMatches}</span>
              </span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
