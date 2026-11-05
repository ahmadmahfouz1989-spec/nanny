import { after, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/auth";
import { deliverBroadcast, queueRetry } from "@/lib/broadcast";

/** Sends again only to the people no device accepted it for. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const admin = await requireAdmin(supabase);
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const { id } = await params;
  const db = createAdminClient();
  const { waiting } = await queueRetry(db, id);
  if (waiting > 0) after(() => deliverBroadcast(createAdminClient(), id));
  return NextResponse.json({ queued: waiting });
}
