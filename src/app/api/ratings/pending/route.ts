import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { pendingRatings } from "@/lib/rating-prompts";

/** Providers the signed-in customer could rate now (the "How was it?" card on Home). */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ items: [] });
  const locale = request.nextUrl.searchParams.get("locale") === "ar" ? "ar" : "en";
  return NextResponse.json({ items: await pendingRatings(user.id, locale) });
}
