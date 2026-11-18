import { describe, expect, it } from "vitest";
import { searchServices } from "@/lib/service-search";
import type { Category } from "@/lib/categories";

const category = (slug: string, name_en: string, name_ar: string, tagline_en = "", tagline_ar = "") =>
  ({ id: slug, slug, name_en, name_ar, tagline_en, tagline_ar, icon: null, status: "live", href: null, sort_order: 0 }) as unknown as Category;
const categories = [
  category("nanny", "Nanny", "مربيات", "Nannies and babysitters"),
  category("maintenance", "Home Maintenance", "صيانة المنزل", "Plumbers, electricians, painters"),
  category("errands", "Delivery & Errands", "توصيل ومشاوير"),
  category("cleaning", "Cleaning", "تنظيف"),
];

describe("searching for a service", () => {
  it("finds the trade, in English or in everyday Arabic", () => {
    expect(searchServices("plumber", categories, "en")[0]).toEqual({ href: "/browse/maintenance?service=plumber", title: "Plumber", category: "Home Maintenance" });
    expect(searchServices("سنكري", categories, "ar")[0]?.href).toBe("/browse/maintenance?service=plumber");
    expect(searchServices("plumbing", categories, "en")[0]?.href).toBe("/browse/maintenance?service=plumber");
  });
  it("finds a category by its name", () => {
    expect(searchServices("babysitter", categories, "en")).toEqual([{ href: "/browse/nanny", title: "Nanny", category: "" }]);
  });
  it("finds services without a filter on their category page", () => {
    expect(searchServices("water tank", categories, "en")[0]?.href).toBe("/browse/cleaning");
  });
  it("finds the service in a longer search", () => {
    expect(searchServices("plumber in Jounieh", categories, "en")[0]?.href).toBe("/browse/maintenance?service=plumber");
    expect(searchServices("babysitter Hamra", categories, "en")[0]?.href).toBe("/browse/nanny");
  });
  it("finds nothing for a person's name", () => {
    expect(searchServices("Layla Haddad", categories, "en")).toEqual([]);
  });
});
