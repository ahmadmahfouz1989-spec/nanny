import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/app-shell";
import FeedClient from "./feed-client";

export default async function FeedPage({
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

  if (profile?.role !== "parent" && profile?.role !== "nanny") {
    redirect({ href: "/categories/nanny/onboarding", locale });
  }

  return (
    <AppShell active="feed">
      <FeedClient myRole={profile!.role as "parent" | "nanny"} />
    </AppShell>
  );
}
