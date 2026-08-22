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

  const { data: profile } = await supabase.from("users").select("role").eq("id", user!.id).single();

  if (profile?.role === "parent") {
    const { data: existing } = await supabase
      .from("parent_profiles")
      .select("id")
      .eq("user_id", user!.id)
      .maybeSingle();
    if (existing) redirect({ href: "/dashboard", locale });
    return <ParentOnboarding />;
  }

  if (profile?.role === "nanny") {
    const { data: existing } = await supabase
      .from("nanny_profiles")
      .select("id")
      .eq("user_id", user!.id)
      .maybeSingle();
    if (existing) redirect({ href: "/dashboard", locale });
    return <NannyOnboarding />;
  }

  redirect({ href: "/dashboard", locale });
}
