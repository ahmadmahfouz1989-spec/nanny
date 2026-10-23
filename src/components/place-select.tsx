"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

export type PlaceTree = { id: string; name_en: string; name_ar: string; districts: { id: string; name_en: string; name_ar: string }[] }[];

let cached: Promise<PlaceTree> | null = null;
function loadTree() {
  cached ??= fetch("/api/areas?tree=1")
    .then((r) => r.json())
    .then((b) => (b.tree ?? []) as PlaceTree)
    .catch(() => {
      cached = null;
      return [];
    });
  return cached;
}

/** Every governorate with its districts, fetched once per page load. */
export function usePlaceTree() {
  const [tree, setTree] = useState<PlaceTree>([]);
  useEffect(() => {
    let active = true;
    loadTree().then((t) => active && setTree(t));
    return () => {
      active = false;
    };
  }, []);
  return tree;
}

/** The name of a governorate or district id, from the tree. */
export function placeName(tree: PlaceTree, id: string, locale: string): string | null {
  for (const g of tree) {
    if (g.id === id) return locale === "ar" ? g.name_ar : g.name_en;
    const d = g.districts.find((x) => x.id === id);
    if (d) return locale === "ar" ? d.name_ar : d.name_en;
  }
  return null;
}

/**
 * Pick a whole governorate or one district in it -- the area filter on
 * Home, Matches and Search. A governorate with a single district (Beirut,
 * Akkar) is listed once.
 */
export default function PlaceSelect({
  value,
  onChange,
  placeholder,
  className = "",
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
  ariaLabel?: string;
}) {
  const t = useTranslations("Location");
  const locale = useLocale();
  const tree = usePlaceTree();
  const name = (x: { name_en: string; name_ar: string }) => (locale === "ar" ? x.name_ar : x.name_en);

  return (
    <select className={className} value={value} onChange={(e) => onChange(e.target.value)} aria-label={ariaLabel ?? placeholder}>
      <option value="">{placeholder}</option>
      {tree.map((g) =>
        g.districts.length > 1 ? (
          <optgroup key={g.id} label={name(g)}>
            <option value={g.id}>{t("allOf", { place: name(g) })}</option>
            {g.districts.map((d) => (
              <option key={d.id} value={d.id}>
                {name(d)}
              </option>
            ))}
          </optgroup>
        ) : (
          <option key={g.id} value={g.id}>
            {name(g)}
          </option>
        ),
      )}
    </select>
  );
}
