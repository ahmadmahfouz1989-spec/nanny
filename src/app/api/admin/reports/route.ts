import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/auth";

export async function GET(request: Request) {
  const supabase = await createClient();
  const admin = await requireAdmin(supabase);
  if (!admin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") ?? "open";

  const db = createAdminClient();
  const { data, error } = await db
    .from("reports")
    .select(
      "id, reason, details, status, created_at, resolution_notes, reporter:reporter_user_id(id, email, role), reported:reported_user_id(id, email, role)",
    )
    .eq("status", status)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ reports: data });
}
