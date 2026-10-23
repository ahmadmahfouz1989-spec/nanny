/**
 * Lebanon's areas for picking where someone is: governorate → district
 * (qada) → area, imported from Open Admin Data (20261023000002). Client-
 * and server-safe: no database access here.
 */

export type AreaLevel = "governorate" | "district" | "area";

export type AreaHit = {
  id: string;
  level: AreaLevel;
  name_en: string;
  name_ar: string;
  /** For an area: its district; for a district: its governorate. */
  parent: { id: string; name_en: string; name_ar: string } | null;
  governorateId: string;
  districtId: string | null;
};

/**
 * Lowercase, accents and Arabic diacritics gone, the Arabic letters people
 * spell interchangeably folded together (أ إ آ → ا, ة → ه, ى → ي), and
 * punctuation as spaces -- the same as locations.search_text was built
 * with, so "Saïda", "saida" and "صيدا" all find Saida.
 */
export function normalizeAreaText(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ًͯ-ٰٟـ]/g, "")
    .toLowerCase()
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[-'’`.,()/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Best matches first: a name that is the words typed, then one starting with them, then the rest. */
export function rankAreaHits<T extends { search_text: string | null; level: string }>(rows: T[], query: string): T[] {
  const q = normalizeAreaText(query);
  const score = (r: T) => {
    const names = (r.search_text ?? "").split(" | ");
    if (names.includes(q)) return 0;
    if (names.some((n) => n.startsWith(q))) return 1;
    if (names.some((n) => n.split(" ").some((w) => w.startsWith(q)))) return 2;
    return 3;
  };
  return [...rows].sort((a, b) => score(a) - score(b) || (a.level === "district" ? -1 : 0) - (b.level === "district" ? -1 : 0));
}
