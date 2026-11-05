import { redirect } from "@/i18n/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { mustVerifyPhone } from "@/lib/phone-gate";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/app-shell";
import { TRADES, type Trade } from "@/lib/validation/maintenance";
import QuoteForm from "./quote-form";

/**
 * "Get quotes" for a Home Maintenance job: describe it once, and nearby
 * tradespeople of that trade send a price and when they can come. No
 * profile form first -- the request becomes the customer's maintenance
 * request (lib/job-request-profile.ts).
 */
export default async function NewQuotePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ trade?: string }>;
}) {
  const { locale } = await params;
  const { trade } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect({ href: `/login?next=/${locale}/quotes/new`, locale });
  if (await mustVerifyPhone(createAdminClient(), user!)) redirect({ href: `/verify-phone?next=/quotes/new`, locale });

  // The name is only asked for when none of their profiles has one yet.
  const { data: account } = await supabase.from("users").select("full_name").eq("id", user!.id).single();
  const { data: named } = await supabase
    .from("generic_profiles")
    .select("full_name")
    .eq("user_id", user!.id)
    .neq("status", "draft")
    .limit(1)
    .maybeSingle();

  const initialTrade = (TRADES as readonly string[]).includes(trade ?? "") ? (trade as Trade) : null;

  return (
    <AppShell active="maintenance">
      <QuoteForm needsName={!named && !account?.full_name} initialTrade={initialTrade} />
    </AppShell>
  );
}
