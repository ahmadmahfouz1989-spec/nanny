import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/auth";

const limit = z.number().int().min(1).max(100000).nullable();
const ruleSchema = z.object({
  key: z.string().min(1).max(60),
  points: z.number().int().min(0).max(100000),
  enabled: z.boolean(),
  maxTotal: limit,
  maxPerDay: limit,
  maxPerMonth: limit,
});

/** Points per activity, on/off and limits -- changed without a deploy. */
export async function PUT(request: Request) {
  const supabase = await createClient();
  if (!(await requireAdmin(supabase))) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const parsed = z.object({ rules: z.array(ruleSchema).max(100) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the values" }, { status: 400 });
  const db = createAdminClient();
  for (const r of parsed.data.rules) {
    const { error } = await db
      .from("points_rules")
      .update({ points: r.points, enabled: r.enabled, max_total: r.maxTotal, max_per_day: r.maxPerDay, max_per_month: r.maxPerMonth, updated_at: new Date().toISOString() })
      .eq("key", r.key);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
