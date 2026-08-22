"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ui } from "@/lib/ui";

type Analytics = {
  totalParents: number;
  totalNannies: number;
  approvedParents: number;
  approvedNannies: number;
  pendingProfiles: number;
  mutualMatches: number;
  openReports: number;
  suspendedUsers: number;
};

export default function AdminOverviewPage() {
  const t = useTranslations("Admin");
  const [data, setData] = useState<Analytics | null>(null);

  useEffect(() => {
    fetch("/api/admin/analytics")
      .then((res) => res.json())
      .then(setData);
  }, []);

  const tiles: { label: string; value: number | undefined }[] = [
    { label: t("statParents"), value: data?.totalParents },
    { label: t("statNannies"), value: data?.totalNannies },
    { label: t("statApprovedParents"), value: data?.approvedParents },
    { label: t("statApprovedNannies"), value: data?.approvedNannies },
    { label: t("statPending"), value: data?.pendingProfiles },
    { label: t("statMutualMatches"), value: data?.mutualMatches },
    { label: t("statOpenReports"), value: data?.openReports },
    { label: t("statSuspendedUsers"), value: data?.suspendedUsers },
  ];

  return (
    <>
      <h1 className="font-display text-3xl font-semibold mb-8">{t("overviewTitle")}</h1>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {tiles.map((tile) => (
          <div key={tile.label} className={ui.card + " p-5"}>
            <p className="text-2xl font-display font-semibold">{tile.value ?? "—"}</p>
            <p className="text-xs text-muted mt-1">{tile.label}</p>
          </div>
        ))}
      </div>
    </>
  );
}
