import { redirect } from "@/i18n/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { LAST_CATEGORY_COOKIE } from "@/lib/last-category";

/**
 * Home: where sign-in, email confirmation and old links land. Sends an
 * account with profiles in exactly one category straight to that
 * category's dashboard, one with several to the one it was last in, and
 * everyone else to the category hub. A match notification's ?match=
 * target (old nanny links) is carried along.
 */
export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ match?: string }>;
}) {
  const { locale } = await params;
  const { match } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect({ href: "/login", locale });
  }

  // A draft is only a claimed role with nothing filled in -- not a reason
  // to skip the hub.
  const { data: profiles } = await supabase
    .from("generic_profiles")
    .select("categories(slug)")
    .eq("user_id", user!.id)
    .neq("status", "draft");
  const slugs = [
    ...new Set(
      (profiles ?? [])
        .map((p) => p.categories?.slug)
        .filter((s): s is string => !!s),
    ),
  ];

  // With several services, the one you were last in (if it's still yours).
  const lastSlug = (await cookies()).get(LAST_CATEGORY_COOKIE)?.value;
  const slug = slugs.length === 1 ? slugs[0] : slugs.find((s) => s === lastSlug);
  if (slug) {
    const href = `/categories/${slug}/dashboard`;
    redirect({ href: match ? `${href}?match=${match}` : href, locale });
  }
  redirect({ href: "/categories", locale });
}
