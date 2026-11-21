import { redirect } from "@/i18n/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { mustVerifyPhone } from "@/lib/phone-gate";
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

/** "Order again": the same service, description and places as one of their own orders. */
async function prefillFromOrder(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, orderId: string): Promise<OrderPrefill | null> {
  const db = createAdminClient();
  const { data: o } = await db.from("errand_orders").select("*").eq("id", orderId).eq("seeker_user_id", userId).eq("category", "errands").maybeSingle();
  if (!o) return null;
  const { data: districts } = await supabase
    .from("locations")
    .select("id, parent_location_id")
    .in("id", [o.pickup_district_id, o.dropoff_district_id].filter((v): v is string => !!v));
  const parent = (id: string | null) => (id ? (districts ?? []).find((d) => d.id === id)?.parent_location_id ?? null : null);
  const mapPlace = (lat: number | null, lng: number | null, rest: { address: string | null; name: string | null; instructions: string | null; contactName: string | null; contactPhone: string | null }) =>
    lat !== null && lng !== null
      ? { point: { lat, lng }, address: rest.address ?? "", name: rest.name ?? "", instructions: rest.instructions ?? "", contactName: rest.contactName ?? "", contactPhone: rest.contactPhone ?? "" }
      : null;
  return {
    service: (ERRAND_SERVICES as readonly string[]).includes(o.service) ? (o.service as ErrandService) : "delivery",
    description: o.description,
    pickup: { governorateId: parent(o.pickup_district_id), districtId: o.pickup_district_id, areaId: o.pickup_area_id, detail: o.pickup_detail ?? "" },
    dropoffDetail: o.dropoff_detail ?? "",
    dropoff: o.dropoff_district_id
      ? { governorateId: parent(o.dropoff_district_id), districtId: o.dropoff_district_id, areaId: o.dropoff_area_id, detail: o.dropoff_detail ?? "" }
      : undefined,
    pickupMap:
      mapPlace(o.pickup_lat, o.pickup_lng, { address: o.pickup_address, name: o.pickup_place_name, instructions: o.pickup_instructions, contactName: o.pickup_contact_name, contactPhone: o.pickup_contact_phone }) ?? undefined,
    dropoffMap:
      mapPlace(o.dropoff_lat, o.dropoff_lng, { address: o.dropoff_address, name: o.dropoff_place_name, instructions: o.dropoff_instructions, contactName: o.dropoff_contact_name, contactPhone: o.dropoff_contact_phone }) ?? undefined,
    timing: "asap",
    scheduledAt: "",
    budget: o.budget_usd !== null ? String(o.budget_usd) : "",
    again: true,
    autoAccept: o.auto_accept,
  };
}

export default async function NewOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ from?: string; again?: string }>;
}) {
  const { locale } = await params;
  const { from, again } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect({ href: "/login", locale });
  if (await mustVerifyPhone(createAdminClient(), user!)) redirect({ href: `/verify-phone?next=/orders/new`, locale });
  // No "About you" first: the form asks for a name when it has none, and
  // an order needs nothing else from the account.

  const prefill =
    again && /^[0-9a-f-]{36}$/i.test(again)
      ? await prefillFromOrder(supabase, user!.id, again)
      : from === "request"
        ? await prefillFromRequest(supabase, user!.id)
        : null;
  // The name is only asked for when none of their profiles has one yet.
  const { data: account } = await supabase.from("users").select("full_name").eq("id", user!.id).single();
  const { data: named } = await supabase
    .from("generic_profiles")
    .select("full_name")
    .eq("user_id", user!.id)
    .neq("status", "draft")
    .limit(1)
    .maybeSingle();

  return (
    <AppShell active="orders">
      <NewOrderForm prefill={prefill} needsName={!named && !account?.full_name} userId={user!.id} />
    </AppShell>
  );
}
