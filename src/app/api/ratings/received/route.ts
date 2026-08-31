import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// The ratings a user has received. `ratings` RLS already lets a user read
// rows where they're the ratee, so the request-scoped client is enough.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("ratings")
    .select("score, comment, created_at")
    .eq("ratee_user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const reviews = (data ?? []).map((r) => ({
    score: r.score,
    comment: r.comment,
    createdAt: r.created_at,
  }));
  const count = reviews.length;
  const average = count
    ? Math.round((reviews.reduce((s, r) => s + r.score, 0) / count) * 10) / 10
    : null;

  return NextResponse.json({ average, count, reviews });
}
