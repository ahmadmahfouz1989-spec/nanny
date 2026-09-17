import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import NannyRolePicker from "./nanny-role-picker";

// A sibling static route to categories/[slug]/onboarding -- Next.js
// matches this exact literal path ahead of the dynamic [slug] segment, so
// /categories/nanny/onboarding lands here rather than in the generic
// (generic_profiles-based) onboarding flow nursing uses.
export default async function NannyCategoryOnboardingPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ role?: string }>;
}) {
  const { locale } = await params;
  const { role: roleHintParam } = await searchParams;
  const roleHint = roleHintParam === "parent" || roleHintParam === "nanny" ? roleHintParam : null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect({ href: "/login", locale });
  }

  const { data: profile } = await supabase.from("users").select("role").eq("id", user!.id).single();

  // Already oriented (either from the legacy signup-time choice, or a
  // previous visit here) -- the existing /onboarding route already
  // branches correctly on a set role, no need to duplicate that here.
  if (profile?.role === "parent" || profile?.role === "nanny") {
    redirect({ href: "/onboarding", locale });
  }

  return <NannyRolePicker roleHint={roleHint} />;
}
