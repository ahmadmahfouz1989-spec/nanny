"use client";

import { useRouter } from "@/i18n/navigation";
import { ui } from "@/lib/ui";
import { rememberRegion } from "@/lib/region";

type Place = { id: string; name: string };
export type RegionGroup = Place & { districts: Place[] };

/** The trust filters, as they ride in the address (?idc=1&exp=5&lang=en). */
export type TrustFilters = { idChecked: boolean; minYears: number; language: string };

/**
 * Where (a governorate or one of its districts, remembered like Home's
 * area picker), for repairs and errands which kind of pro, and quick
 * trust filters: ID checked, 5+ years, a language.
 */
export default function BrowseFilters({
  slug,
  regions,
  region,
  services,
  service,
  trust,
  trustOptions,
  labels,
}: {
  slug: string;
  regions: RegionGroup[];
  region: string;
  services: { code: string; label: string }[];
  service: string;
  trust: TrustFilters;
  /** Which trust filters this service has (no languages for repairs, no years for errands). */
  trustOptions: { years: boolean; languages: { code: string; label: string }[] };
  labels: { allLebanon: string; all: string; idChecked: string; years: string };
}) {
  const router = useRouter();
  const go = (next: { region?: string; service?: string } & Partial<TrustFilters>) => {
    const r = next.region ?? region;
    const s = next.service ?? service;
    const f = { ...trust, ...next };
    const qs = new URLSearchParams();
    // "all" overrides the remembered area for this view.
    qs.set("region", r || "all");
    if (s) qs.set("service", s);
    if (f.idChecked) qs.set("idc", "1");
    if (f.minYears) qs.set("exp", String(f.minYears));
    if (f.language) qs.set("lang", f.language);
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
      {/* Sideways on the phone: one row, scrolls when it doesn't fit. */}
      <div className="-mx-6 flex gap-2 overflow-x-auto px-6 pb-0.5 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden">
        <button type="button" aria-pressed={trust.idChecked} className={ui.pill(trust.idChecked) + " shrink-0"} onClick={() => go({ idChecked: !trust.idChecked })}>
          ✓ {labels.idChecked}
        </button>
        {trustOptions.years && (
          <button type="button" aria-pressed={trust.minYears > 0} className={ui.pill(trust.minYears > 0) + " shrink-0"} onClick={() => go({ minYears: trust.minYears ? 0 : 5 })}>
            {labels.years}
          </button>
        )}
        {trustOptions.languages.map((l) => (
          <button
            key={l.code}
            type="button"
            aria-pressed={trust.language === l.code}
            className={ui.pill(trust.language === l.code) + " shrink-0"}
            onClick={() => go({ language: trust.language === l.code ? "" : l.code })}
          >
            {l.label}
          </button>
        ))}
      </div>
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
