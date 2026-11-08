"use client";

import { useRouter } from "@/i18n/navigation";
import { ui } from "@/lib/ui";
import { rememberRegion } from "@/lib/region";

type Place = { id: string; name: string };
export type RegionGroup = Place & { districts: Place[] };

/**
 * Where (a governorate or one of its districts, remembered like Home's
 * area picker) and, for repairs and errands, which kind of pro.
 */
export default function BrowseFilters({
  slug,
  regions,
  region,
  services,
  service,
  labels,
}: {
  slug: string;
  regions: RegionGroup[];
  region: string;
  services: { code: string; label: string }[];
  service: string;
  labels: { allLebanon: string; all: string };
}) {
  const router = useRouter();
  const go = (next: { region?: string; service?: string }) => {
    const r = next.region ?? region;
    const s = next.service ?? service;
    const qs = new URLSearchParams();
    // "all" overrides the remembered area for this view.
    qs.set("region", r || "all");
    if (s) qs.set("service", s);
    router.push(`/browse/${slug}?${qs}`);
  };

  return (
    <div className="flex flex-col gap-3">
      <select
        className={ui.select}
        value={region}
        aria-label={labels.allLebanon}
        onChange={(e) => {
          rememberRegion(e.target.value);
          go({ region: e.target.value });
        }}
      >
        <option value="">{labels.allLebanon}</option>
        {regions.map((g) => (
          <optgroup key={g.id} label={g.name}>
            <option value={g.id}>{g.name}</option>
            {g.districts
              .filter((d) => d.name !== g.name)
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
      {services.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button type="button" aria-pressed={!service} className={ui.pill(!service)} onClick={() => go({ service: "" })}>
            {labels.all}
          </button>
          {services.map((s) => (
            <button key={s.code} type="button" aria-pressed={service === s.code} className={ui.pill(service === s.code)} onClick={() => go({ service: s.code })}>
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
