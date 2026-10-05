"use client";

import { useEffect, useState } from "react";

export type Governorate = {
  id: string;
  name_en: string;
  name_ar: string;
  name_fr: string;
};

// One request per page load, however many components ask -- the list is
// tiny and never changes while the page is open.
let cached: Promise<Governorate[]> | null = null;

function loadGovernorates(): Promise<Governorate[]> {
  cached ??= fetch("/api/locations?level=governorate")
    .then((res) => res.json())
    .then((body) => (body.locations ?? []) as Governorate[])
    .catch(() => {
      cached = null;
      return [];
    });
  return cached;
}

export function governorateName(g: Governorate, locale: string) {
  if (locale === "ar") return g.name_ar;
  if (locale === "fr") return g.name_fr;
  return g.name_en;
}

export function useGovernorates(): Governorate[] {
  const [governorates, setGovernorates] = useState<Governorate[]>([]);
  useEffect(() => {
    let active = true;
    loadGovernorates().then((list) => {
      if (active) setGovernorates(list);
    });
    return () => {
      active = false;
    };
  }, []);
  return governorates;
}

/** Localized names for a list of governorate ids, in the given order; unknown ids are dropped. */
export function governorateNames(ids: unknown, governorates: Governorate[], locale: string): string[] {
  if (!Array.isArray(ids)) return [];
  const byId = new Map(governorates.map((g) => [g.id, g]));
  return ids.flatMap((id) => {
    const g = typeof id === "string" ? byId.get(id) : undefined;
    return g ? [governorateName(g, locale)] : [];
  });
}
