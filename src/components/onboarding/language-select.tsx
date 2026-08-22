"use client";

import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { ui } from "@/lib/ui";

type Language = { id: string; code: string; name_en: string; name_ar: string; name_fr: string };

function localizedName(lang: Language, locale: string) {
  if (locale === "ar") return lang.name_ar;
  if (locale === "fr") return lang.name_fr;
  return lang.name_en;
}

export default function LanguageSelect({
  value,
  onChange,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const locale = useLocale();
  const [languages, setLanguages] = useState<Language[]>([]);

  useEffect(() => {
    fetch("/api/languages")
      .then((res) => res.json())
      .then((body) => setLanguages(body.languages ?? []));
  }, []);

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  }

  return (
    <div className="flex flex-wrap gap-2">
      {languages.map((lang) => (
        <button type="button" key={lang.id} onClick={() => toggle(lang.id)} className={ui.pill(value.includes(lang.id))}>
          {localizedName(lang, locale)}
        </button>
      ))}
    </div>
  );
}
