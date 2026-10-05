import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/auth";

const PAGE_SIZE = 30;
const ACTIVE_WINDOWS: Record<string, number> = { "7d": 7, "30d": 30 };

/**
 * Who is talking to whom, how many messages each side has sent, and when
 * -- never what was said (see 20261005000002_admin_conversation_activity.sql).
 * Headline numbers come back with the first page only.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const admin = await requireAdmin(supabase);
  if (!admin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category") || null;
  const activeDays = ACTIVE_WINDOWS[searchParams.get("active") ?? ""];
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const activeSince = activeDays ? new Date(Date.now() - activeDays * 86_400_000).toISOString() : undefined;

  const db = createAdminClient();
  const [{ data: rows, error }, stats] = await Promise.all([
    db.rpc("admin_conversations", {
      p_category: category ?? undefined,
      p_active_since: activeSince,
      p_limit: PAGE_SIZE,
      p_offset: (page - 1) * PAGE_SIZE,
    }),
    page === 1
      ? db.rpc("admin_conversation_stats", { p_since: new Date(Date.now() - 7 * 86_400_000).toISOString() })
      : Promise.resolve({ data: null }),
  ]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const total = Number(rows?.[0]?.total_count ?? 0);
  const s = stats.data?.[0];

  return NextResponse.json({
    conversations: (rows ?? []).map((r) => ({
      matchId: r.match_id,
      category: { slug: r.category_slug, nameEn: r.category_name_en, nameAr: r.category_name_ar },
      seeker: { profileId: r.seeker_profile_id, name: r.seeker_name },
      provider: { profileId: r.provider_profile_id, name: r.provider_name },
      startedBy: r.started_by_side,
      messages: Number(r.messages),
      fromSeeker: Number(r.from_seeker),
      fromProvider: Number(r.from_provider),
      startedAt: r.started_at,
      lastMessageAt: r.last_message_at,
      blocked: r.status.startsWith("declined_by_"),
    })),
    total,
    hasMore: page * PAGE_SIZE < total,
    stats: s
      ? {
          conversations: Number(s.conversations),
          twoWay: Number(s.two_way),
          startedThisWeek: Number(s.started_since),
          messagesThisWeek: Number(s.messages_since),
        }
      : null,
  });
}
