import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveUser } from "@/lib/session";
import { isBlocked } from "@/lib/matching/match-access";
import { MISSED_STATUSES } from "@/lib/calls";
import { CALL_ENTRY_COLUMNS, toCallEntry, type CallEntry } from "@/lib/call-history";

const PAGE = 100;

export type CallLogItem = CallEntry & {
  categorySlug: string;
  counterpart: { id: string; name: string; photoUrl: string | null };
  /** Missed and not looked at yet. */
  unseen: boolean;
};

/**
 * Your calls, newest first, for the Calls tab: everyone you called or who
 * called you, with how each one went. `?filter=missed` keeps the ones you
 * missed. Calls in blocked conversations are left out, like the chats.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const user = await requireActiveUser(supabase);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const missedOnly = new URL(request.url).searchParams.get("filter") === "missed";
  const db = createAdminClient();
  let query = db
    .from("calls")
    .select(`${CALL_ENTRY_COLUMNS}, callee_id, seen_at`)
    .order("created_at", { ascending: false })
    .limit(PAGE);
  query = missedOnly
    ? query.eq("callee_id", user.id).in("status", [...MISSED_STATUSES, "failed"]).is("answered_at", null)
    : query.or(`caller_id.eq.${user.id},callee_id.eq.${user.id}`);
  const { data: rows } = await query;
  if (!rows?.length) return NextResponse.json({ calls: [] });

  const matchIds = [...new Set(rows.map((r) => r.match_id))];
  const { data: matches } = await db
    .from("generic_matches")
    .select("id, status, seeker_profile_id, provider_profile_id")
    .in("id", matchIds);
  const profileIds = [...new Set((matches ?? []).flatMap((m) => [m.seeker_profile_id, m.provider_profile_id]))];
  const { data: profiles } = await db
    .from("generic_profiles")
    .select("id, user_id, full_name, profile_photo_url, categories(slug)")
    .in("id", profileIds);
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  type Profile = NonNullable<typeof profiles>[number];
  const sides = new Map<string, { mine?: Profile; other?: Profile }>();
  for (const m of matches ?? []) {
    if (isBlocked(m.status)) continue;
    const seeker = profileById.get(m.seeker_profile_id);
    const provider = profileById.get(m.provider_profile_id);
    const iAmSeeker = seeker?.user_id === user.id;
    sides.set(m.id, { mine: iAmSeeker ? seeker : provider, other: iAmSeeker ? provider : seeker });
  }

  const calls: CallLogItem[] = [];
  for (const row of rows) {
    const side = sides.get(row.match_id);
    if (!side) continue;
    calls.push({
      ...toCallEntry(row, user.id),
      categorySlug: side.mine?.categories?.slug ?? "",
      counterpart: { id: side.other?.id ?? "", name: side.other?.full_name ?? "", photoUrl: side.other?.profile_photo_url ?? null },
      unseen: row.callee_id === user.id && !row.seen_at && MISSED_STATUSES.includes(row.status as never),
    });
  }
  return NextResponse.json({ calls });
}
