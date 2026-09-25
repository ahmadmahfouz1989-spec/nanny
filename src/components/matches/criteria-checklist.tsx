"use client";

import { useTranslations } from "next-intl";
import type { CriterionResult } from "@/lib/matching/generic-engine";

// Covers every criterion key across every matching engine (nanny's
// engine.ts, nursing's generic-engine.ts, tutoring's tutoring-engine.ts, and
// whatever a future category adds) -- a breakdown only ever has a subset of
// these, and unknown keys are simply skipped, so one shared component/order/
// label map works for all of them instead of one per category.
const ORDER = [
  "location",
  "availability",
  "employmentType",
  "liveArrangement",
  "format",
  "language",
  "specialty",
  "subject",
  "gradeLevel",
  "childAgeExperience",
  "transportation",
] as const;

const LABEL_KEY: Record<(typeof ORDER)[number], string> = {
  location: "criteriaLocation",
  availability: "criteriaAvailability",
  employmentType: "criteriaEmploymentType",
  liveArrangement: "criteriaLiveArrangement",
  format: "criteriaFormat",
  language: "criteriaLanguage",
  specialty: "criteriaSpecialty",
  subject: "criteriaSubject",
  gradeLevel: "criteriaGradeLevel",
  childAgeExperience: "criteriaChildAgeExperience",
  transportation: "criteriaTransportation",
};

export default function CriteriaChecklist({ breakdown }: { breakdown: Partial<Record<string, CriterionResult>> }) {
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
