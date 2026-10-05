// Every category with working onboarding, matching and dashboards. Kept
// apart from ./categories.ts (which imports the server Supabase client) so
// client components can use it too. A new category is added here, plus a
// schema pair in CATEGORY_SCHEMAS (src/app/api/generic-profile/route.ts),
// a form pair in category-onboarding-client.tsx and a scoring branch in
// src/lib/matching/generic-recompute.ts.
export const CATEGORY_SLUGS = ["nanny", "nursing", "tutoring", "maintenance"] as const;

export type CategorySlug = (typeof CATEGORY_SLUGS)[number];

export function isCategorySlug(slug: string): slug is CategorySlug {
  return (CATEGORY_SLUGS as readonly string[]).includes(slug);
}
