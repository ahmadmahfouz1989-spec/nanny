import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/app-shell";
import OrdersClient from "./orders-client";

/** Delivery & Errands orders: the customer's, and the requests reaching a provider. */
export default async function OrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { locale } = await params;
  const { tab } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect({ href: "/login", locale });

  return (
    <AppShell active="errands">
      <OrdersClient initialTab={tab === "provider" ? "provider" : "seeker"} />
    </AppShell>
  );
}
