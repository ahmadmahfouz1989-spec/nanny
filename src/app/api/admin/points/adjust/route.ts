import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/auth";

const bodySchema = z.object({
  userId: z.string().uuid(),
  points: z.number().int().min(-100000).max(100000).refine((n) => n !== 0, "Enter points to add or take away"),
  reason: z.string().trim().min(3, "Say why").max(300),
});

/** Adds or takes away points by hand, always with the reason and who did it. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const admin = await requireAdmin(supabase);
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the values" }, { status: 400 });
  const { error } = await createAdminClient()
    .from("points_ledger")
    .insert({ user_id: parsed.data.userId, points: parsed.data.points, kind: "admin", note: parsed.data.reason, created_by: admin.userId });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
