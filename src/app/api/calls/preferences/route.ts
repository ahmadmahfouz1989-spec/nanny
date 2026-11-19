import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveUser } from "@/lib/session";
import { resolveMatchAccess } from "@/lib/matching/match-access";

/**
 * Who can call you: everyone you've talked with (the default), or nobody
 * (Settings); and, per conversation, calls off from that one person.
 * GET ?match=<id> also says whether that conversation's calls are off.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const user = await requireActiveUser(supabase);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const matchId = new URL(request.url).searchParams.get("match");
  const db = createAdminClient();
  const { data: me } = await db.from("users").select("accepts_calls").eq("id", user.id).maybeSingle();
  let muted = false;
  if (matchId && z.uuid().safeParse(matchId).success) {
    const { count } = await db.from("call_mutes").select("match_id", { count: "exact", head: true }).eq("user_id", user.id).eq("match_id", matchId);
    muted = (count ?? 0) > 0;
  }
  return NextResponse.json({ acceptsCalls: me?.accepts_calls !== false, muted });
}

const putSchema = z.union([
  z.object({ acceptsCalls: z.boolean() }),
  z.object({ matchId: z.uuid(), muted: z.boolean() }),
]);

export async function PUT(request: Request) {
  const supabase = await createClient();
  const user = await requireActiveUser(supabase);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const parsed = putSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const db = createAdminClient();

  if ("acceptsCalls" in parsed.data) {
    const { error } = await db.from("users").update({ accepts_calls: parsed.data.acceptsCalls }).eq("id", user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ acceptsCalls: parsed.data.acceptsCalls });
  }

  const { matchId, muted } = parsed.data;
  if (!(await resolveMatchAccess(supabase, matchId, user.id))) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  const { error } = muted
    ? await db.from("call_mutes").upsert({ user_id: user.id, match_id: matchId }, { onConflict: "user_id,match_id", ignoreDuplicates: true })
    : await db.from("call_mutes").delete().eq("user_id", user.id).eq("match_id", matchId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ muted });
}
