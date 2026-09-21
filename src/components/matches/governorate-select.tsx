"use client";

import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { ui } from "@/lib/ui";

type Location = { id: string; name_en: string; name_ar: string; name_fr: string };

function localizedName(l: Location, locale: string) {
  if (locale === "ar") return l.name_ar;
  if (locale === "fr") return l.name_fr;
  return l.name_en;
}

/** Governorate filter dropdown shared by every match-results filter bar. */
export default function GovernorateSelect({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const locale = useLocale();
  const [options, setOptions] = useState<Location[]>([]);

  useEffect(() => {
    fetch("/api/locations?level=governorate")
      .then((res) => res.json())
      .then((body) => setOptions(body.locations ?? []))
      .catch(() => {});
  }, []);

  return (
    <select className={ui.select + " w-auto"} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {localizedName(o, locale)}
        </option>
      ))}
    </select>
  );
}
