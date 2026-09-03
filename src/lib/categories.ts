import { createClient } from "@/lib/supabase/server";

export type Category = {
  id: string;
  slug: string;
  name_en: string;
  name_ar: string;
  tagline_en: string;
  tagline_ar: string;
  icon: string;
  status: "live" | "coming_soon";
  href: string | null;
  sort_order: number;
};

export async function getCategories(): Promise<Category[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("categories")
    .select("id, slug, name_en, name_ar, tagline_en, tagline_ar, icon, status, href, sort_order")
    .order("sort_order", { ascending: true });
  return (data ?? []) as Category[];
}

export function categoryName(c: Category, locale: string) {
  return locale === "ar" ? c.name_ar : c.name_en;
}

export function categoryTagline(c: Category, locale: string) {
  return locale === "ar" ? c.tagline_ar : c.tagline_en;
}
