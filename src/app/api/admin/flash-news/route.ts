import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/auth";
import { FLASH_NEWS_MAX } from "@/lib/flash-news";

/** Every flash news, live and taken down, newest first. */
export async function GET() {
  const supabase = await createClient();
  if (!(await requireAdmin(supabase))) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const { data } = await createAdminClient()
    .from("flash_news")
    .select("id, body, body_ar, created_at, ended_at, pushed_at, push_sent, push_failed")
    .order("created_at", { ascending: false })
    .limit(50);
  return NextResponse.json({ news: data ?? [] });
}

const postSchema = z.object({
  body: z.string().trim().min(2).max(FLASH_NEWS_MAX),
  bodyAr: z.string().trim().max(FLASH_NEWS_MAX).optional(),
});

/** Posts a flash news: the banner shows it from the next check (within a couple of minutes). */
export async function POST(request: Request) {
  const supabase = await createClient();
  const admin = await requireAdmin(supabase);
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const parsed = postSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Write between 2 and 300 characters" }, { status: 400 });
  const bodyAr = parsed.data.bodyAr && parsed.data.bodyAr.length >= 2 ? parsed.data.bodyAr : null;
  const { data, error } = await createAdminClient()
    .from("flash_news")
    .insert({ body: parsed.data.body, body_ar: bodyAr, created_by: admin.userId })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id }, { status: 201 });
}
