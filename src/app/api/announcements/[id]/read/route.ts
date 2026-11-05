import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveUser } from "@/lib/session";

/** Marks one announcement read for the caller, in the inbox and the bell. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const user = await requireActiveUser(supabase);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;
  const now = new Date().toISOString();
  const db = createAdminClient();
  await db.from("broadcast_recipients").update({ read_at: now }).eq("broadcast_id", id).eq("user_id", user.id).is("read_at", null);
  await db.from("notifications").update({ read_at: now }).eq("user_id", user.id).eq("type", "announcement").eq("payload->>broadcast_id", id).is("read_at", null);
  return NextResponse.json({ ok: true });
}
