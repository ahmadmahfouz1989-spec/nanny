"use client";

import { useTranslations } from "next-intl";
import { ui } from "@/lib/ui";
import type { FieldErrors } from "@/lib/form-errors";

/** A field's problem, shown right under it (or under its label). */
export function FieldError({ field, errors }: { field: string; errors: FieldErrors }) {
  const tw = useTranslations("Wizard");
  const key = errors[field];
  if (!key) return null;
  return (
    <p data-field-error className="-mt-1 text-xs font-medium text-danger" role="alert">
      {tw(key)}
    </p>
  );
}

/**
 * A profile-form label: marks optional fields, and shows the field's error
 * under it once a save has been tried. Everything not marked optional is
 * required (EditShell says so above the form).
 */
export default function FieldLabel({
  field,
  errors,
  optional = false,
  className = "",
  children,
}: {
  field?: string;
  errors?: FieldErrors;
  optional?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const tw = useTranslations("Wizard");
  return (
    <>
      <label className={`${ui.label} ${className}`}>
        {children}
        {optional && <span className="ms-1.5 text-xs font-normal text-muted">({tw("optional")})</span>}
      </label>
      {field && errors && <FieldError field={field} errors={errors} />}
    </>
  );
}
