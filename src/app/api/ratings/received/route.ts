import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { reviewsReceivedByUser } from "@/lib/ratings";

// The ratings a user has received, across both the legacy nanny/parent
// `ratings` table and `generic_ratings` (nursing, tutoring, ...) -- a
// person's reputation is per-account, not per-category.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  return NextResponse.json(await reviewsReceivedByUser(user.id));
}
