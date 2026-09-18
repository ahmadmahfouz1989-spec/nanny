import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import NannyRolePicker from "./nanny-role-picker";

// A sibling static route to categories/[slug]/onboarding -- Next.js
// matches this exact literal path ahead of the dynamic [slug] segment, so
// /categories/nanny/onboarding lands here rather than in the generic
// (generic_profiles-based) onboarding flow nursing uses.
export default async function NannyCategoryOnboardingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect({ href: "/login", locale });
  }

  const { data: profile } = await supabase.from("users").select("role").eq("id", user!.id).single();

  let hasRealProfile = false;
  if (profile?.role === "parent") {
    const { data } = await supabase.from("parent_profiles").select("id").eq("user_id", user!.id).maybeSingle();
    hasRealProfile = !!data;
  } else if (profile?.role === "nanny") {
    const { data } = await supabase.from("nanny_profiles").select("id").eq("user_id", user!.id).maybeSingle();
    hasRealProfile = !!data;
  }

  // A real, already-submitted profile means there's nothing left to
  // pick -- go straight to it. Otherwise (no role yet, or a role
  // claimed with nothing filled in) always show both options again,
  // never auto-skip just because a role was claimed.
  if (hasRealProfile) {
    redirect({ href: "/onboarding", locale });
  }

  const currentRole = profile?.role === "parent" || profile?.role === "nanny" ? profile.role : null;
  return <NannyRolePicker currentRole={currentRole} />;
}
