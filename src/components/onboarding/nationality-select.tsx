"use client";

import { useTranslations } from "next-intl";
import { NATIONALITIES } from "@/lib/validation/profile";
import { ui } from "@/lib/ui";

export default function NationalitySelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const t = useTranslations("Nationality");
  return (
    <select className={ui.select} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{t("placeholder")}</option>
      {NATIONALITIES.map((n) => (
        <option key={n} value={n}>
          {t(n)}
        </option>
      ))}
    </select>
  );
}
