import type { z } from "zod";

/** Per-field error keys (into the Wizard messages), keyed by the schema's top-level field name. */
export type FieldErrors = Partial<Record<string, string>>;

// The schemas' own messages are English-only and, where a schema has none,
// Zod's technical defaults ("Too small: expected…"). The field's label
// already says what it is, so a short translated hint per kind of problem
// reads better in both languages -- worded for what the person has to do:
// type something, type more, or choose from a list.
function isBlank(input: unknown) {
  return input === undefined || input === null || (typeof input === "string" && input.trim() === "");
}

function messageKey(issue: z.ZodError["issues"][number]): string {
  // A cross-field rule (superRefine) knows what's wrong better than any
  // generic hint, and names its own Wizard message.
  if (issue.code === "custom" && typeof issue.params?.key === "string") return issue.params.key;
  switch (issue.code) {
    case "too_small":
      if (issue.origin === "array") return "errorPickOne";
      if (issue.origin === "number") return "errorNumber";
      return isBlank(issue.input) ? "errorRequired" : "errorTooShort";
    case "too_big":
      return issue.origin === "number" ? "errorNumber" : "errorTooLong";
    case "invalid_type":
      if (issue.expected === "number") return "errorNumber";
      // Only a select's blank option (null) gets here -- e.g. the governorate.
      return "errorChoose";
    case "invalid_value":
      return "errorChoose";
    default:
      return isBlank(issue.input) ? "errorRequired" : "errorCheck";
  }
}

/**
 * The first problem with each field of `data`, as a Wizard message key.
 * Nested fields (availability.days, experience[0]) report under their
 * top-level name, which is what the form's labels are keyed by.
 */
export function fieldErrorsFor(schema: z.ZodType, data: unknown): FieldErrors {
  const errors: FieldErrors = {};
  const result = schema.safeParse(data, { reportInput: true });
  if (result.success) return errors;
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

const requiredBySchema = new WeakMap<z.ZodType, string[]>();

/**
 * How many of a form's required answers are filled in ("5 of 9"): the
 * top-level fields an empty form is missing, against the ones still
 * missing now. What the progress bar shows, instead of how far you scrolled.
 */
export function requiredProgress(schema: z.ZodType, data: unknown): { done: number; total: number } {
  let required = requiredBySchema.get(schema);
  if (!required) {
    required = Object.keys(fieldErrorsFor(schema, {}));
    requiredBySchema.set(schema, required);
  }
  const missing = fieldErrorsFor(schema, data);
  return { done: required.filter((k) => !missing[k]).length, total: required.length };
}
