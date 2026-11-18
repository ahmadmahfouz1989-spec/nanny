import en from "../../messages/en.json";
import ar from "../../messages/ar.json";
import type { Category } from "@/lib/categories";
import { normalizeForSearch, searchAlternatives, searchWords } from "@/lib/profile-search";
import { TRADES } from "@/lib/validation/maintenance";
import { ERRAND_SERVICES } from "@/lib/validation/errands";

/**
 * The services a search names, so "plumber" or "سنكري" leads to Home
 * Maintenance's plumbers even when no person's profile matches the words:
 * every service people can be found under, in English and Arabic, plus the
 * everyday synonyms people search for.
 */
export type ServiceResult = { href: string; title: string; category: string };

type Entry = { slug: string; code: string | null; filter: boolean; text: string; label: { en: string; ar: string } };

// Which labels list each category's services, and whether its browse page
// can show just that service (?service=).
const SERVICE_LISTS: { slug: string; namespace: keyof typeof en; codes?: readonly string[]; filter: boolean }[] = [
  { slug: "maintenance", namespace: "Trades", codes: TRADES, filter: true },
  { slug: "errands", namespace: "ErrandServices", codes: ERRAND_SERVICES, filter: true },
  { slug: "cleaning", namespace: "CleaningServices", filter: false },
  { slug: "beauty", namespace: "BeautyServices", filter: false },
  { slug: "car", namespace: "CarServices", filter: false },
  { slug: "tutoring", namespace: "Subjects", filter: false },
];

function entries(categories: Category[]): Entry[] {
  const list: Entry[] = [];
  for (const c of categories) {
    if (c.status !== "live") continue;
    list.push({
      slug: c.slug,
      code: null,
      filter: false,
      text: normalizeForSearch([c.slug, c.name_en, c.name_ar, c.tagline_en, c.tagline_ar].filter(Boolean).join(" ")),
      label: { en: c.name_en, ar: c.name_ar },
    });
  }
  const live = new Set(list.map((e) => e.slug));
  for (const s of SERVICE_LISTS) {
    if (!live.has(s.slug)) continue;
    const enLabels = en[s.namespace] as Record<string, unknown>;
    const arLabels = ar[s.namespace] as Record<string, unknown>;
    for (const code of s.codes ?? Object.keys(enLabels)) {
      const e = enLabels[code];
      const a = arLabels[code];
      if (typeof e !== "string" || typeof a !== "string") continue;
      list.push({ slug: s.slug, code, filter: s.filter, text: normalizeForSearch(`${code.replace(/_/g, " ")} ${e} ${a}`), label: { en: e, ar: a } });
    }
  }
  return list;
}

/** A word of the query is found when some word of the entry starts with it (or with its synonym). */
function matches(text: string, word: string) {
  const words = text.split(/[^\p{L}\p{N}]+/u);
  return searchAlternatives(word).some((w) => words.some((t) => t.startsWith(w) || (w.length >= 4 && t.includes(w))));
}

export function searchServices(query: string, categories: Category[], locale: string, limit = 4): ServiceResult[] {
  const words = searchWords(query);
  if (words.length === 0) return [];
  const names = new Map(categories.map((c) => [c.slug, locale === "ar" ? c.name_ar : c.name_en]));
  // Any word can name the service ("nurse Jounieh", "math teacher"); the
  // entries matching the most words come first.
  const found = entries(categories)
    .map((e) => ({ e, hits: words.filter((w) => w.length >= 3 && matches(e.text, w)).length }))
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .map((x) => x.e);
  // A matching service makes its category's own entry redundant.
  const withService = new Set(found.filter((e) => e.code).map((e) => e.slug));
  const results: ServiceResult[] = [];
  for (const e of found) {
    if (!e.code && withService.has(e.slug)) continue;
    const title = locale === "ar" ? e.label.ar : e.label.en;
    results.push({
      href: e.code && e.filter ? `/browse/${e.slug}?service=${e.code}` : `/browse/${e.slug}`,
      title,
      category: e.code ? (names.get(e.slug) ?? "") : "",
    });
    if (results.length >= limit) break;
  }
  return results;
}
