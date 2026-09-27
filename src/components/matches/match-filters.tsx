"use client";

import { useTranslations } from "next-intl";
import GovernorateSelect from "./governorate-select";
import { SearchIcon } from "@/components/nav-icons";
import { DAYS } from "@/lib/validation/profile";
import { ui } from "@/lib/ui";

/** Search and filters above a category's match list. */
export default function MatchFilters({
  search,
  onSearch,
  governorateId,
  onGovernorate,
  day,
  onDay,
  minYears,
  onMinYears,
  showMinYears,
  hasFilters,
  onClear,
}: {
  search: string;
  onSearch: (value: string) => void;
  governorateId: string;
  onGovernorate: (value: string) => void;
  day: string;
  onDay: (value: string) => void;
  minYears: string;
  onMinYears: (value: string) => void;
  // Minimum experience only makes sense for a seeker looking at providers.
  showMinYears: boolean;
  hasFilters: boolean;
  onClear: () => void;
}) {
  const t = useTranslations("Matches");
  const tDays = useTranslations("Days");

  return (
    <div className="flex flex-wrap items-center gap-2 mb-6 rounded-2xl border border-border bg-surface-sunken/50 p-3">
      <div className="relative w-full">
        <SearchIcon className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
        <input
          type="search"
          dir="auto"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={t("filterSearch")}
          aria-label={t("filterSearch")}
          className={ui.input + " ps-9!"}
        />
      </div>
      <GovernorateSelect value={governorateId} onChange={onGovernorate} placeholder={t("filterAllAreas")} />
      <select className={ui.select + " w-auto"} value={day} onChange={(e) => onDay(e.target.value)}>
        <option value="">{t("filterAnyDay")}</option>
        {DAYS.map((d) => (
          <option key={d} value={d}>
            {tDays(d)}
          </option>
        ))}
      </select>
      {showMinYears && (
        <input
          type="number"
          min={0}
          className={ui.input + " w-auto"}
          placeholder={t("filterMinExperience")}
          value={minYears}
          onChange={(e) => onMinYears(e.target.value)}
        />
      )}
      {hasFilters && (
        <button type="button" onClick={onClear} className={ui.buttonGhost + " text-sm"}>
          {t("clearFilters")}
        </button>
      )}
    </div>
  );
}
