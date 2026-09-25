import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireActiveUser } from "@/lib/session";
import { reviewsReceivedByUser } from "@/lib/ratings";

// The ratings a user has received, across every category -- a person's
// reputation is per-account, not per-category.
export async function GET() {
  const supabase = await createClient();
  const user = await requireActiveUser(supabase);

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  return NextResponse.json(await reviewsReceivedByUser(user.id));
}
