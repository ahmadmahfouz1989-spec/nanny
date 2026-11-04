import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/app-shell";
import { ERRAND_SERVICES, type ErrandService } from "@/lib/validation/errands";
import NewOrderForm, { type OrderPrefill } from "./new-order-form";

const str = (v: unknown) => (typeof v === "string" ? v : "");

/**
 * Straight after someone fills in their Delivery & Errands request
 * (?from=request), the order starts from those answers, so the same
 * questions aren't asked twice.
 */
async function prefillFromRequest(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<OrderPrefill | null> {
  const { data: category } = await supabase.from("categories").select("id").eq("slug", "errands").maybeSingle();
  if (!category) return null;
  const { data: profile } = await supabase
    .from("generic_profiles")
    .select("location_id, attributes")
    .eq("user_id", userId)
    .eq("category_id", category.id)
    .eq("role", "seeker")
    .neq("status", "draft")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!profile) return null;
  const a = (profile.attributes ?? {}) as Record<string, unknown>;
  const service = (ERRAND_SERVICES as readonly string[]).includes(str(a.errandService)) ? (a.errandService as ErrandService) : "delivery";
  return {
    service,
    description: str(a.jobDescription),
    pickup: {
      governorateId: profile.location_id,
      districtId: str(a.districtId) || null,
      areaId: str(a.areaId) || null,
      detail: str(a.pickupPlace) || str(a.institution) || str(a.storeName),
    },
    dropoffDetail: str(a.dropoffPlace),
    timing: a.timing === "scheduled" ? "scheduled" : "asap",
    scheduledAt: str(a.scheduledAt),
    budget: typeof a.budgetUsd === "number" ? String(a.budgetUsd) : "",
  };
}

export default async function NewOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { locale } = await params;
  const { from } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect({ href: "/login", locale });

  const prefill = from === "request" ? await prefillFromRequest(supabase, user!.id) : null;
  // The name is only asked for when none of their profiles has one yet.
  const { data: named } = await supabase
    .from("generic_profiles")
    .select("full_name")
    .eq("user_id", user!.id)
    .neq("status", "draft")
    .limit(1)
    .maybeSingle();

  return (
    <AppShell active="errands">
      <NewOrderForm prefill={prefill} needsName={!named} />
    </AppShell>
  );
}
