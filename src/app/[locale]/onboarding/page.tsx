import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import ParentOnboarding from "./parent-onboarding";
import NannyOnboarding from "./nanny-onboarding";

export default async function OnboardingPage({
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

  const { data: profile } = await supabase.from("users").select("role, contact_phone").eq("id", user!.id).single();

  if (profile?.role === "parent") {
    const { data: existing } = await supabase
      .from("parent_profiles")
      .select("*, parent_profile_languages(language_id)")
      .eq("user_id", user!.id)
      .maybeSingle();
    return (
      <ParentOnboarding
        initialProfile={existing ? { ...existing, contact_phone: profile.contact_phone } : null}
      />
    );
  }

  if (profile?.role === "nanny") {
    const { data: existing } = await supabase
      .from("nanny_profiles")
      .select("*, nanny_profile_languages(language_id), nanny_experience(age_group, years_experience)")
      .eq("user_id", user!.id)
      .maybeSingle();
    return (
      <NannyOnboarding
        initialProfile={existing ? { ...existing, contact_phone: profile.contact_phone } : null}
      />
    );
  }

  redirect({ href: "/dashboard", locale });
}
