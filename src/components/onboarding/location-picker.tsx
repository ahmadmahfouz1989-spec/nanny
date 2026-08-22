"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ui } from "@/lib/ui";

type Location = {
  id: string;
  name_en: string;
  name_ar: string;
  name_fr: string;
  level: string;
  parent_location_id: string | null;
};

function localizedName(location: Location, locale: string) {
  if (locale === "ar") return location.name_ar;
  if (locale === "fr") return location.name_fr;
  return location.name_en;
}

async function fetchLocations(level: string, parentId?: string) {
  const params = new URLSearchParams({ level });
  if (parentId) params.set("parent_id", parentId);
  const res = await fetch(`/api/locations?${params.toString()}`);
  const body = await res.json();
  return (body.locations ?? []) as Location[];
}

export default function LocationPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (areaId: string | null) => void;
}) {
  const locale = useLocale();
  const t = useTranslations("Location");
  const [governorates, setGovernorates] = useState<Location[]>([]);
  const [districts, setDistricts] = useState<Location[]>([]);
  const [areas, setAreas] = useState<Location[]>([]);
  const [governorateId, setGovernorateId] = useState("");
  const [districtId, setDistrictId] = useState("");

  useEffect(() => {
    fetchLocations("governorate").then(setGovernorates);
  }, []);

  async function handleGovernorateChange(id: string) {
    setGovernorateId(id);
    setDistrictId("");
    setDistricts([]);
    setAreas([]);
    onChange(null);
    if (id) setDistricts(await fetchLocations("district", id));
  }

  async function handleDistrictChange(id: string) {
    setDistrictId(id);
    setAreas([]);
    onChange(null);
    if (id) setAreas(await fetchLocations("area", id));
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      <select className={ui.select} value={governorateId} onChange={(e) => handleGovernorateChange(e.target.value)}>
        <option value="">{t("governorate")}</option>
        {governorates.map((g) => (
          <option key={g.id} value={g.id}>
            {localizedName(g, locale)}
          </option>
        ))}
      </select>

      <select
        className={ui.select}
        value={districtId}
        onChange={(e) => handleDistrictChange(e.target.value)}
        disabled={!governorateId}
      >
        <option value="">{t("district")}</option>
        {districts.map((d) => (
          <option key={d.id} value={d.id}>
            {localizedName(d, locale)}
          </option>
        ))}
      </select>

      <select
        className={ui.select}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        disabled={!districtId}
      >
        <option value="">{t("area")}</option>
        {areas.map((a) => (
          <option key={a.id} value={a.id}>
            {localizedName(a, locale)}
          </option>
        ))}
      </select>
    </div>
  );
}
