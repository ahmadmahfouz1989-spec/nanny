import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/app-shell";
import MessagesClient from "./messages-client";

export default async function MessagesPage({
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

  return (
    <AppShell active="messages">
      <MessagesClient />
    </AppShell>
  );
}
