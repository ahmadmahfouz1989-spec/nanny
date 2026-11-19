import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveUser } from "@/lib/session";
import { isBlocked, resolveMatchAccess } from "@/lib/matching/match-access";
import { iceServers } from "@/lib/ice-servers";
import { callAllowed, closeLeftoverCalls, profileCard, pushIncomingCall, ringCutoff, ringingDevices, takesCalls, tooManyCalls } from "@/lib/calls";

const startSchema = z.object({ matchId: z.uuid() });

/** Starts a call to the other person in a conversation. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const user = await requireActiveUser(supabase);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const parsed = startSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const access = await resolveMatchAccess(supabase, parsed.data.matchId, user.id);
  if (!access) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  if (isBlocked(access.status)) return NextResponse.json({ error: "This conversation is closed", code: "blocked" }, { status: 403 });

  const db = createAdminClient();
  if (!(await callAllowed(db, access.id))) {
    return NextResponse.json({ error: "Send a message first", code: "no_conversation" }, { status: 403 });
  }
  if (!(await takesCalls(db, access.otherUserId, access.id))) {
    return NextResponse.json({ error: "They don't take calls", code: "calls_off" }, { status: 403 });
  }
  if (await tooManyCalls(db, user.id)) {
    return NextResponse.json({ error: "Too many calls, try again in a few minutes", code: "too_many" }, { status: 429 });
  }

  await closeLeftoverCalls(db, user.id);
  const { data: call, error } = await db
    .from("calls")
    .insert({ match_id: access.id, caller_id: user.id, callee_id: access.otherUserId })
    .select("id, match_id, status, created_at")
    .single();
  if (error || !call) return NextResponse.json({ error: error?.message ?? "Couldn't start the call" }, { status: 500 });

  const [me, them, servers, devices] = await Promise.all([
    profileCard(db, access.myProfileId),
    profileCard(db, access.otherProfileId),
    iceServers(),
    ringingDevices(access.otherUserId),
  ]);
  pushIncomingCall(access.otherUserId, call.id, access.id, me.name);

  return NextResponse.json(
    {
      call: { id: call.id, matchId: call.match_id, createdAt: call.created_at },
      counterpart: them,
      iceServers: servers,
      // Their phone rings for calls on its own (and doesn't yet say when it
      // does): no "they're not in the app" hint while it may be ringing.
      phoneRings: devices.length > 0,
    },
    { status: 201 },
  );
}

/**
 * A call ringing for you right now, if any -- what the app checks when it
 * opens from the incoming-call notification, in case the realtime event
 * came before it was listening.
 */
export async function GET() {
  const supabase = await createClient();
  const user = await requireActiveUser(supabase);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: call } = await supabase
    .from("calls")
    .select("id, match_id, created_at")
    .eq("callee_id", user.id)
    .eq("status", "ringing")
    .gte("created_at", ringCutoff())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!call) return NextResponse.json({ call: null });

  const access = await resolveMatchAccess(supabase, call.match_id, user.id);
  if (!access) return NextResponse.json({ call: null });
  const counterpart = await profileCard(createAdminClient(), access.otherProfileId);
  return NextResponse.json({ call: { id: call.id, matchId: call.match_id, createdAt: call.created_at }, counterpart });
}
