import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/auth";
import { errandSettings } from "@/lib/errand-orders";
import { settingsSchema } from "@/lib/validation/errand-order";

/** The Delivery & Errands matching settings, changed without a code deploy. */
export async function GET() {
  const supabase = await createClient();
  if (!(await requireAdmin(supabase))) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const s = await errandSettings(createAdminClient());
  return NextResponse.json({ settings: { maxRecipients: s.max_recipients, openMinutes: s.open_minutes } });
}

export async function PUT(request: Request) {
  const supabase = await createClient();
  const admin = await requireAdmin(supabase);
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const parsed = settingsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the values" }, { status: 400 });

  const { error } = await createAdminClient()
    .from("errand_settings")
    .update({
      max_recipients: parsed.data.maxRecipients,
      open_minutes: parsed.data.openMinutes,
      updated_at: new Date().toISOString(),
      updated_by: admin.userId,
    })
    .eq("id", true);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ settings: parsed.data });
}
