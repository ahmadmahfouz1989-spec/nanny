import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveUser } from "@/lib/session";
import { markMissedCallsSeen } from "@/lib/calls";

/** You've looked at your missed calls (opened the Calls tab): the badge clears. */
export async function POST() {
  const supabase = await createClient();
  const user = await requireActiveUser(supabase);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  await markMissedCallsSeen(createAdminClient(), user.id);
  return NextResponse.json({ ok: true });
}
