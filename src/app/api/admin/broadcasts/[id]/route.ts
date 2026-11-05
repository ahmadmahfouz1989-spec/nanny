import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/auth";

/** The delivery log: who got one message, and how far it went for each. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const admin = await requireAdmin(supabase);
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const { id } = await params;
  const { data, error } = await createAdminClient()
    .from("broadcast_recipients")
    .select("user_id, push_status, devices_sent, devices_failed, read_at, users(full_name, email, phone)")
    .eq("broadcast_id", id)
    .order("push_status")
    .limit(1000);
  if (error) return NextResponse.json({ error: "invalid" }, { status: 400 });

  return NextResponse.json({
    recipients: (data ?? []).map((r) => ({
      user_id: r.user_id,
      name: r.users?.full_name || r.users?.email || (r.users?.phone ? `+${r.users.phone}` : ""),
      push_status: r.push_status,
      devices_sent: r.devices_sent,
      devices_failed: r.devices_failed,
      read_at: r.read_at,
    })),
  });
}
