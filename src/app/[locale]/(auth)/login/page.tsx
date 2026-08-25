import { Suspense } from "react";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolvePostLoginPath } from "@/lib/auth/post-login-redirect";
import LoginForm from "./login-form";

export default async function LoginPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).single();

    let moderationStatus: string | null = null;
    if (profile?.role === "parent" || profile?.role === "nanny") {
      const { data: matchProfile } = await supabase
        .from(profile.role === "parent" ? "parent_profiles" : "nanny_profiles")
        .select("moderation_status")
        .eq("user_id", user.id)
        .maybeSingle();
      moderationStatus = matchProfile?.moderation_status ?? null;
    }

    redirect({ href: resolvePostLoginPath(profile?.role, moderationStatus), locale });
  }

  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
