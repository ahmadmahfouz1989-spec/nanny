"use client";

import { useTranslations } from "next-intl";
import type { Criterion, CriterionResult } from "@/lib/matching/engine";

const ORDER: Criterion[] = [
  "location",
  "employmentType",
  "liveArrangement",
  "salary",
  "language",
  "childAgeExperience",
  "transportation",
  "availability",
];

const LABEL_KEY: Record<Criterion, string> = {
  location: "criteriaLocation",
  availability: "criteriaAvailability",
  employmentType: "criteriaEmploymentType",
  liveArrangement: "criteriaLiveArrangement",
  salary: "criteriaSalary",
  language: "criteriaLanguage",
  childAgeExperience: "criteriaChildAgeExperience",
  transportation: "criteriaTransportation",
};

export default function CriteriaChecklist({ breakdown }: { breakdown: Record<Criterion, CriterionResult> }) {
  const t = useTranslations("Matches");

  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1.5">
      {ORDER.map((key) => {
        const result = breakdown[key];
        if (!result) return null;
        return (
          <span
            key={key}
            className={`inline-flex items-center gap-1 text-xs ${result.met ? "text-secondary" : "text-muted"}`}
          >
            {result.met ? "✓" : "✗"} {t(LABEL_KEY[key])}
          </span>
        );
      })}
    </div>
  );
}
