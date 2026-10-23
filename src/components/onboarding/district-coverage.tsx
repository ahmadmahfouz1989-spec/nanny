"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import FieldLabel from "@/components/onboarding/field-label";
import { ui } from "@/lib/ui";
import type { AreaHit } from "@/lib/areas";

type Governorate = { id: string; name_en: string; name_ar: string };

/**
 * A provider ticks the other districts (qadas) they also work in, grouped
 * by governorate, nearest first -- their own district always counts.
 * Customers there see them in their matches.
 */
export default function DistrictCoverage({
  value,
  onChange,
  homeDistrictId,
  homeGovernorateId,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  homeDistrictId: string | null;
  homeGovernorateId: string | null;
}) {
  const t = useTranslations("Location");
  const locale = useLocale();
  const [groups, setGroups] = useState<{ gov: Governorate; districts: AreaHit[] }[]>([]);

  useEffect(() => {
    let active = true;
    (async () => {
      const govs: Governorate[] = (await fetch("/api/locations?level=governorate").then((r) => r.json())).locations ?? [];
      const lists = await Promise.all(govs.map((g) => fetch(`/api/areas?governorate=${g.id}`).then((r) => r.json())));
      if (active) setGroups(govs.map((gov, i) => ({ gov, districts: lists.at(i)?.areas ?? [] })));
    })().catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const name = (x: { name_en: string; name_ar: string }) => (locale === "ar" ? x.name_ar : x.name_en);
  // Your own governorate's districts first: that's where most people also work.
  const ordered = [...groups].sort((a, b) => Number(b.gov.id === homeGovernorateId) - Number(a.gov.id === homeGovernorateId));

  return (
    <div className="flex flex-col gap-2">
      <FieldLabel optional>{t("coverTitle")}</FieldLabel>
      <p className="-mt-1 text-xs text-muted">{t("coverHint")}</p>
      {ordered.map(({ gov, districts }) => (
        <div key={gov.id} className="flex flex-col gap-1.5">
          <p className="text-xs font-semibold text-muted">{name(gov)}</p>
          <div className="flex flex-wrap gap-2">
            {districts
              .filter((d) => d.id !== homeDistrictId)
              .map((d) => {
                const on = value.includes(d.id);
                return (
                  <button
                    key={d.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => onChange(on ? value.filter((v) => v !== d.id) : [...value, d.id])}
                    className={ui.pill(on)}
                  >
                    {name(d)}
                  </button>
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );
}
