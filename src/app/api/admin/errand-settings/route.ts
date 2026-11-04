import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/auth";
import { errandSettings, type ErrandSettings } from "@/lib/errand-orders";
import { settingsSchema, type SettingsInput } from "@/lib/validation/errand-order";

const toInput = (s: ErrandSettings): Required<SettingsInput> => ({
  maxRecipients: s.max_recipients,
  openMinutes: s.open_minutes,
  quoteOpenMinutes: s.quote_open_minutes,
  waveSize: s.wave_size,
  responseSeconds: s.response_seconds,
  chooseSeconds: s.choose_seconds,
  confirmSeconds: s.confirm_seconds,
  initialRadiusKm: s.initial_radius_km,
  radiusStepKm: s.radius_step_km,
  maxRadiusKm: s.max_radius_km,
  maxActiveOrders: s.max_active_orders,
});

/** The Delivery & Errands (and repair quotes) matching settings, changed without a code deploy. */
export async function GET() {
  const supabase = await createClient();
  if (!(await requireAdmin(supabase))) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  return NextResponse.json({ settings: toInput(await errandSettings(createAdminClient())) });
}

export async function PUT(request: Request) {
  const supabase = await createClient();
  const admin = await requireAdmin(supabase);
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const parsed = settingsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the values" }, { status: 400 });
  const v = parsed.data;

  const { error } = await createAdminClient()
    .from("errand_settings")
    .update({
      max_recipients: v.maxRecipients,
      open_minutes: v.openMinutes,
      ...(v.quoteOpenMinutes ? { quote_open_minutes: v.quoteOpenMinutes } : {}),
      wave_size: v.waveSize,
      response_seconds: v.responseSeconds,
      choose_seconds: v.chooseSeconds,
      confirm_seconds: v.confirmSeconds,
      initial_radius_km: v.initialRadiusKm,
      radius_step_km: v.radiusStepKm,
      max_radius_km: v.maxRadiusKm,
      max_active_orders: v.maxActiveOrders,
      updated_at: new Date().toISOString(),
      updated_by: admin.userId,
    })
    .eq("id", true);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ settings: v });
}
