import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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

  // Only which menu item to highlight: a repair job lives under Home
  // Maintenance. Who may see the order is checked by its API route.
  const { data: order } = await createAdminClient().from("errand_orders").select("category").eq("id", id).maybeSingle();

  return (
    <AppShell active={order?.category === "maintenance" ? "maintenance" : "errands"}>
      <OrderDetail orderId={id} />
    </AppShell>
  );
}
