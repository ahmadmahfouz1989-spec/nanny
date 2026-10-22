"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import GovernorateSelect from "./governorate-select";
import { SearchIcon } from "@/components/nav-icons";
import { DAYS } from "@/lib/validation/profile";
import { ui } from "@/lib/ui";

/**
 * Search and filters above a category's match list. The search box is
 * always there; area, day and experience fold behind a Filters button
 * (with a count of the ones on), so the first matches show without
 * scrolling past four controls.
 */
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
  const active = [governorateId, day, showMinYears ? minYears : ""].filter(
    Boolean,
  ).length;
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-6 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
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
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className={`flex shrink-0 items-center gap-1.5 rounded-xl border px-3.5 py-2.5 text-sm font-medium transition-colors ${
            active ? "border-primary text-primary" : "border-border text-ink/80"
          }`}
        >
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            aria-hidden
          >
            <path d="M4 6h16M7 12h10M10 18h4" />
          </svg>
          {t("filters")}
          {active > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold text-white">
              {active}
            </span>
          )}
        </button>
      </div>
      {open && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-surface-sunken/50 p-3">
          <GovernorateSelect
            value={governorateId}
            onChange={onGovernorate}
            placeholder={t("filterAllAreas")}
          />
          <select
            className={ui.select + " w-auto"}
            value={day}
            onChange={(e) => onDay(e.target.value)}
          >
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
        </div>
      )}
      {hasFilters && (
        <button
          type="button"
          onClick={onClear}
          className={ui.buttonGhost + " self-start text-sm"}
        >
          {t("clearFilters")}
        </button>
      )}
    </div>
  );
}
