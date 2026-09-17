"use client";

import { useTranslations } from "next-intl";
import type { CareCriterion, CriterionResult } from "@/lib/matching/generic-engine";

const ORDER: CareCriterion[] = [
  "location",
  "availability",
  "employmentType",
  "liveArrangement",
  "language",
  "specialty",
  "transportation",
];

const LABEL_KEY: Record<CareCriterion, string> = {
  location: "criteriaLocation",
  availability: "criteriaAvailability",
  employmentType: "criteriaEmploymentType",
  liveArrangement: "criteriaLiveArrangement",
  language: "criteriaLanguage",
  specialty: "criteriaSpecialty",
  transportation: "criteriaTransportation",
};

export default function GenericCriteriaChecklist({ breakdown }: { breakdown: Record<CareCriterion, CriterionResult> }) {
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
