import type { z } from "zod";

/** Per-field error keys (into the Wizard messages), keyed by the schema's top-level field name. */
export type FieldErrors = Partial<Record<string, string>>;

// The schemas' own messages are English-only and, where a schema has none,
// Zod's technical defaults ("Too small: expected…"). The field's label
// already says what it is, so a short translated hint per kind of problem
// reads better in both languages.
function messageKey(issue: z.ZodError["issues"][number]): string {
  switch (issue.code) {
    case "too_small":
      if (issue.origin === "array") return "errorPickOne";
      if (issue.origin === "number") return "errorNumber";
      return "errorRequired";
    case "too_big":
      return issue.origin === "number" ? "errorNumber" : "errorTooLong";
    case "invalid_type":
    case "invalid_value":
      return "errorRequired";
    default:
      return "errorCheck";
  }
}

/**
 * The first problem with each field, as a Wizard message key. Nested
 * fields (availability.days, experience[0]) report under their top-level
 * name, which is what the form's labels are keyed by.
 */
export function fieldErrorsFrom(result: { success: boolean; error?: z.ZodError }): FieldErrors {
  const errors: FieldErrors = {};
  if (result.success || !result.error) return errors;
  for (const issue of result.error.issues) {
    const field = String(issue.path[0] ?? "");
    if (field && !errors[field]) errors[field] = messageKey(issue);
  }
  return errors;
}

/** Brings the first highlighted field into view after a failed save. */
export function scrollToFirstError() {
  requestAnimationFrame(() => {
    document.querySelector("[data-field-error]")?.scrollIntoView({ behavior: "smooth", block: "center" });
  });
}
