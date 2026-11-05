import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/app-shell";
import VerifyPhoneClient from "./verify-phone-client";

/** Asked once, before a first profile, when the verified-phone rule is on (lib/phone-gate.ts). */
export default async function VerifyPhonePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string }>;
}) {
  const { locale } = await params;
  const { next } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect({ href: "/login", locale });

  // Same-site paths only, so the link can't send anyone elsewhere.
  const target = next && next.startsWith("/") && !next.startsWith("//") ? next : "/categories";
  if (user!.phone_confirmed_at) redirect({ href: target, locale });

  return (
    <AppShell active="categories">
      <VerifyPhoneClient next={target} />
    </AppShell>
  );
}
