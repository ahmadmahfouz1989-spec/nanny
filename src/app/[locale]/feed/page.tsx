import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/app-shell";
import FeedClient from "./feed-client";

// The feed is a shared timeline open to any authenticated account,
// regardless of category or role -- no profile/onboarding required.
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

  return (
    <AppShell active="feed">
      <FeedClient />
    </AppShell>
  );
}
