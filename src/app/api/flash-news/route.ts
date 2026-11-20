import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { FlashNews } from "@/lib/flash-news";

/** The flash news that's up now, newest first -- for everyone, visitors too (RLS: live ones only). */
export async function GET() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("flash_news")
    .select("id, body, body_ar, created_at")
    .is("ended_at", null)
    .order("created_at", { ascending: false })
    .limit(5);
  const news: FlashNews[] = (data ?? []).map((n) => ({ id: n.id, body: n.body, bodyAr: n.body_ar, createdAt: n.created_at }));
  return NextResponse.json({ news }, { headers: { "Cache-Control": "no-store" } });
}
