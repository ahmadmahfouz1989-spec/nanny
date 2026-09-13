import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/app-shell";
import FeaturedClient from "@/components/featured-client";

export default async function FeaturedPage({
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
  if (profile?.role === "admin") {
    redirect({ href: "/admin", locale });
  }

  return (
    <AppShell active="nanny">
      <FeaturedClient />
    </AppShell>
  );
}
