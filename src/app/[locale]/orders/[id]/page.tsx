import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/app-shell";
import OrderDetail from "./order-detail";

export default async function OrderPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Back to this order after logging in (a link from a notification or a message).
  if (!user) redirect({ href: `/login?next=${encodeURIComponent(`/orders/${id}`)}`, locale });

  return (
    <AppShell active="orders">
      <OrderDetail orderId={id} />
    </AppShell>
  );
}
