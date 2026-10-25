import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { isNativeAppRequest } from "@/lib/native-app-server";
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
  // Not sold in the apps: Apple and Google require in-app purchases for
  // digital extras like this, so it's website-only (paid by Whish there).
  if (await isNativeAppRequest()) {
    redirect({ href: "/profile", locale });
  }

  return (
    <AppShell active="profile">
      <FeaturedClient />
    </AppShell>
  );
}
