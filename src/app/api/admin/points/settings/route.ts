import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/auth";

/** The release switch for Points & invites. */
export async function PUT(request: Request) {
  const supabase = await createClient();
  if (!(await requireAdmin(supabase))) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const parsed = z.object({ enabled: z.boolean() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const { error } = await createAdminClient().from("points_settings").update({ enabled: parsed.data.enabled, updated_at: new Date().toISOString() }).eq("id", true);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ enabled: parsed.data.enabled });
}
